"""Web-push delivery: VAPID-based push to the subscriber's phone.

Push payloads are tiny (title + body + deep-link). The PWA service worker
renders the notification and tapping it opens /chat?ticker=... (push-to-pull bridge).
"""
from __future__ import annotations

import json
import logging
import os

from pywebpush import WebPushException, webpush

from .. import db

log = logging.getLogger("finn.push")

# VAPID keys are generated once and persisted in settings. For the demo the
# public key is served to the frontend via /api/push/key.
_VAPID_PRIVATE = "FINN_VAPID_PRIVATE_KEY"
_VAPID_PUBLIC = "FINN_VAPID_PUBLIC_KEY"
VAPID_SUBJECT = "mailto:finn-demo@example.com"


def ensure_vapid_keys() -> tuple[str, str]:
    # Ephemeral hosts lose the settings table on restart; env keys keep existing
    # browser subscriptions valid across cold starts.
    pub = os.getenv(_VAPID_PUBLIC) or db.get_setting(_VAPID_PUBLIC)
    priv = os.getenv(_VAPID_PRIVATE) or db.get_setting(_VAPID_PRIVATE)
    if pub and priv:
        return pub, priv
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid, b64urlencode

    v = Vapid()
    v.generate_keys()
    private_raw = b64urlencode(v.private_key.private_numbers().private_value.to_bytes(32, "big"))
    public_raw = b64urlencode(v.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint,
    ))
    db.set_setting(_VAPID_PRIVATE, private_raw)
    db.set_setting(_VAPID_PUBLIC, public_raw)
    return public_raw, private_raw


def get_public_key() -> str:
    pub, _ = ensure_vapid_keys()
    return pub


class PushError(Exception):
    pass


async def send_push(digest: dict, enriched: list[dict], threshold_alerts: list[dict]) -> int:
    """Send push for the single most important item. Returns 1 if sent.

    Two channels: Expo push token (mobile app) first, web-push (PWA) fallback.
    """
    top = _pick_top(digest, enriched, threshold_alerts)
    if not top:
        return 0

    expo_token = db.get_setting("expo_push_token")
    if expo_token:
        sent = await _send_expo(expo_token, top)
        if sent:
            return 1

    sub_raw = db.get_setting("push_subscription")
    if not sub_raw:
        log.info("no push subscription yet; skipping web-push (in-app inbox still updated)")
        return 0
    try:
        webpush(
            subscription_info=json.loads(sub_raw),
            data=json.dumps({"title": top["title"], "body": top["body"], "url": top["url"]}),
            vapid_private_key=ensure_vapid_keys()[1],
            vapid_claims={"sub": VAPID_SUBJECT},
        )
        return 1
    except WebPushException as exc:
        if exc.response and exc.response.status_code in (404, 410):
            log.info("push subscription expired; clearing")
            db.set_setting("push_subscription", "")
        raise PushError(str(exc)) from exc


async def _send_expo(token: str, top: dict) -> bool:
    """Submit one Expo push and validate the returned push ticket."""
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://exp.host/--/api/v2/push/send",
                json={"to": token, "title": top["title"], "body": top["body"],
                      "sound": "default",
                      "data": {"url": top["url"], "alertId": top.get("alert_id")}},
                headers={"Accept": "application/json"},
                timeout=10,
            )
        if resp.status_code != 200:
            log.warning("expo push HTTP %s: %s", resp.status_code, resp.text[:300])
            return False

        try:
            payload = resp.json()
        except (ValueError, json.JSONDecodeError):
            log.warning("expo push returned invalid JSON")
            return False

        if not isinstance(payload, dict):
            log.warning("expo push returned an unexpected body: %r", payload)
            return False
        if payload.get("errors"):
            log.warning("expo push request errors: %r", payload["errors"])
            return False

        data = payload.get("data")
        ticket = data[0] if isinstance(data, list) and len(data) == 1 else data
        if not isinstance(ticket, dict):
            log.warning("expo push response did not contain one ticket: %r", payload)
            return False
        if ticket.get("status") != "ok":
            details = ticket.get("details")
            error_code = details.get("error") if isinstance(details, dict) else None
            log.warning(
                "expo push ticket rejected: %s (%s)",
                ticket.get("message", "unknown error"),
                error_code or "no error code",
            )
            if error_code == "DeviceNotRegistered" and db.get_setting("expo_push_token") == token:
                db.set_setting("expo_push_token", "")
            return False
        if not isinstance(ticket.get("id"), str) or not ticket["id"]:
            log.warning("expo push success ticket had no receipt id: %r", ticket)
            return False
        return True
    except Exception as exc:
        log.warning("expo push failed: %s", exc)
        return False


def _pick_top(digest: dict, enriched: list[dict], threshold_alerts: list[dict]) -> dict | None:
    """Choose the single stored alert worth buzzing a phone for, and link straight to it."""
    for a in db.feed(since_hours=24, include_read=False):
        if a["priority"] > (1 if a["kind"] == "announcement" else 2):
            continue
        p = a.get("payload") or {}
        if a["kind"] == "announcement":
            title = f"{a['ticker']}: {CATEGORY_TITLES.get(p.get('category'), 'new filing')}"
            body = _facts_line(p) or p.get("summary") or (p.get("headline") or "")[:120]
        elif a["kind"] == "volume_spike":
            title = f"{a['ticker']}: unusual volume"
            body = f"Volume {p.get('value')}x the 20-day average, against your {p.get('threshold')}x line"
        else:
            title = f"{a['ticker']}: sharp price move"
            body = f"Moved {p.get('value'):+.1f}% today, past your ±{p.get('threshold')}% line"
        return {"title": title, "body": body[:178], "url": f"/alert/{a['id']}", "alert_id": a["id"]}
    return None


CATEGORY_TITLES = {
    "results": "quarterly results", "management_change": "leadership change", "M&A": "acquisition",
    "litigation": "legal or regulatory action", "pledging": "promoter pledge", "fund_raise": "fund raise",
    "capex": "capacity investment", "insider_trading": "promoter trading", "credit_rating": "rating action",
}


def _facts_line(payload: dict) -> str:
    """'Revenue +18% YoY, PAT −4% YoY' straight from the computed first cut."""
    rows = {r.get("label"): r for r in (payload.get("facts") or {}).get("rows", [])}
    parts = []
    for label in ("Revenue", "EBITDA", "PAT"):
        yoy = (rows.get(label) or {}).get("yoy_pct")
        if yoy is not None:
            parts.append(f"{label} {yoy:+.0f}% YoY")
    return ", ".join(parts)
