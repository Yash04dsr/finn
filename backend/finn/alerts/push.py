"""Web-push delivery: VAPID-based push to the subscriber's phone.

Push payloads are tiny (title + body + deep-link). The PWA service worker
renders the notification and tapping it opens /chat?ticker=... (push-to-pull bridge).
"""
from __future__ import annotations

import json
import logging

from pywebpush import WebPushException, webpush

from .. import db

log = logging.getLogger("finn.push")

# VAPID keys are generated once and persisted in settings. For the demo the
# public key is served to the frontend via /api/push/key.
_VAPID_PRIVATE = "FINN_VAPID_PRIVATE_KEY"
_VAPID_PUBLIC = "FINN_VAPID_PUBLIC_KEY"
VAPID_SUBJECT = "mailto:finn-demo@example.com"


def ensure_vapid_keys() -> tuple[str, str]:
    pub = db.get_setting(_VAPID_PUBLIC)
    priv = db.get_setting(_VAPID_PRIVATE)
    if pub and priv:
        return pub, priv
    from py_vapid import Vapid

    import os
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
        v = Vapid()
        v.generate_keys()
        v.save(f.name)
        data = json.loads(open(f.name).read())
        os.unlink(f.name)
    # py_vapid writes private/public into the file
    private_raw = data.get("privateKey") or data.get("private")
    public_raw = data.get("publicKey") or data.get("public")
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
            vapid_private_key=db.get_setting(_VAPID_PRIVATE),
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
                      "data": {"url": top["url"]}},
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
    """Choose the single item worth buzzing a phone for (priority 1 only)."""
    for ann in sorted(enriched, key=lambda x: (x.get("priority", 4),), reverse=False):
        if ann.get("priority") == 1:
            return {
                "title": f"{ann['ticker']}: {ann.get('category', '').replace('_', ' ')}",
                "body": ann.get("summary") or ann.get("headline", "")[:120],
                "url": f"/chat?ticker={ann['ticker']}&filing=1",
            }
    for a in sorted(threshold_alerts, key=lambda x: x.get("priority", 4)):
        if a.get("priority") <= 2:
            p = a.get("payload", {})
            if a["kind"] == "volume_spike":
                body = f"Volume {p.get('value')}x average (threshold {p.get('threshold')}x)"
            else:
                body = f"Moved {p.get('value'):+.1f}% today"
            return {"title": f"{a['ticker']}: unusual move", "body": body,
                    "url": f"/company/{a['ticker']}"}
    return None
