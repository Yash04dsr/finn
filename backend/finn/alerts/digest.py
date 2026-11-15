"""DigestComposer — the windowed digest: ranked, filtered, beautifully collapsed.

Deterministic ranking + FAST-tier one-liners already attached by enrichers.
The composition itself is rule-based (transparent, free); an optional ADK
DigestWriter pass polishes the title. Noise is counted, not shown.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..config import DEFAULT_WINDOW_HOURS


def compose_digest(enriched: list[dict], threshold_alerts: list[dict],
                   hours: int = DEFAULT_WINDOW_HOURS) -> dict:
    """Build the digest payload: one merged, priority-ranked list; routine buried."""
    items: list[dict] = []

    for a in threshold_alerts:
        items.append({
            "ticker": a["ticker"],
            "category": a["kind"],
            "headline": _threshold_headline(a),
            "one_liner": _threshold_oneliner(a),
            "priority": a.get("priority", 3),
            "filed_at": "",
        })
    for ann in enriched:
        if ann.get("priority", 4) <= 3:
            items.append({
                "ticker": ann["ticker"],
                "category": ann.get("category", "unclassified"),
                "headline": ann.get("headline", ""),
                "one_liner": ann.get("summary", ""),
                "priority": ann.get("priority", 3),
                "filed_at": ann.get("filed_at") or "",
            })

    # Global rank: priority asc, then most recent first within a tier.
    items.sort(key=lambda i: (i["priority"], i["filed_at"]), reverse=False)
    by_tier: dict[int, list[dict]] = {}
    for i in items:
        by_tier.setdefault(i["priority"], []).append(i)
    items = []
    for pri in sorted(by_tier):
        tier_rows = sorted(by_tier[pri], key=lambda x: x["filed_at"], reverse=True)
        items.extend(tier_rows)

    routine_count = sum(1 for a in enriched if a.get("priority", 4) == 4)
    shown = items[:12]
    total = len(items) + routine_count
    return {
        "title": f"Your {hours}h brief",
        "window_hours": hours,
        "items": shown,
        "stats": {
            "total": total,
            "shown": len(shown),
            "hidden": routine_count,
            "held_back": len(items) - len(shown),
        },
    }


def compose_from_alerts(alerts: list[dict], hours: int = DEFAULT_WINDOW_HOURS) -> dict:
    """Build the digest for any window from stored alerts, so the brief matches the feed."""
    enriched: list[dict] = []
    threshold: list[dict] = []
    for a in alerts:
        p = a.get("payload") or {}
        if a["kind"] == "announcement":
            enriched.append({
                "ticker": a["ticker"],
                "category": p.get("category", "unclassified"),
                "headline": p.get("headline", ""),
                "summary": p.get("summary", ""),
                "priority": a.get("priority", 4),
                "filed_at": p.get("filed_at") or a.get("event_at") or "",
            })
        elif a["kind"] in ("volume_spike", "price_move"):
            threshold.append({"ticker": a["ticker"], "kind": a["kind"],
                              "payload": p, "priority": a.get("priority", 3)})
    digest = compose_digest(enriched, threshold, hours=hours)
    digest["is_sample"] = any((a.get("payload") or {}).get("is_sample") for a in alerts)
    return digest


def _threshold_headline(a: dict) -> str:
    p = a.get("payload", {})
    if a["kind"] == "volume_spike":
        return f"{a['ticker']}: unusual volume"
    return f"{a['ticker']}: sharp price move"


def _threshold_oneliner(a: dict) -> str:
    p = a.get("payload", {})
    if a["kind"] == "volume_spike":
        return (f"Volume at {p.get('value', '?')}x the 20-day average "
                f"(threshold {p.get('threshold')}x), close ₹{p.get('close', '?')} ({p.get('change_pct', 0):+.1f}%).")
    return f"Moved {p.get('value', 0):+.1f}% today (threshold ±{p.get('threshold')}%), close ₹{p.get('close', '?')}."
