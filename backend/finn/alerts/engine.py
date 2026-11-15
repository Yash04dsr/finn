"""Deterministic threshold engine — "unusual" means what THE USER says it means.

Reads user-configurable thresholds from settings:
  volume_multiplier: float (default 2.5)  — volume vs 20-day average
  price_move_pct: float (default 4.0)      — abs daily close-to-close move
  categories_watch: list[str]              — categories that always push (else lower priority)
  quiet_hours_start/end: "HH:MM" strings   — pushes suppressed during window (still in feed)

Deliberately pure Python + SQL: math over numbers is not an LLM job.
"""
from __future__ import annotations

import statistics
import re
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .. import db

DEFAULTS = {
    "volume_multiplier": 2.5,
    "price_move_pct": 4.0,
    "categories_watch": ["results", "M&A", "management_change", "litigation",
                         "fund_raise", "insider_trading", "pledging", "capex"],
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00",
    "timezone": "Asia/Kolkata",
}

ALLOWED_CATEGORIES = {
    "results", "M&A", "fund_raise", "management_change", "litigation",
    "insider_trading", "earnings_call", "investor_meetings", "credit_rating",
    "dividend", "bonus_split", "capex", "press_release", "postal_ballot",
    "agm_egm", "pledging", "unclassified",
}


def get_thresholds() -> dict:
    s = db.get_json_setting("thresholds", {})
    merged = {**DEFAULTS, **s}
    return merged


def set_thresholds(update: dict) -> dict:
    current = get_thresholds()
    if "volume_multiplier" in update:
        current["volume_multiplier"] = min(10.0, max(1.1, float(update["volume_multiplier"])))
    if "price_move_pct" in update:
        current["price_move_pct"] = min(25.0, max(0.5, float(update["price_move_pct"])))
    if "categories_watch" in update and isinstance(update["categories_watch"], list):
        current["categories_watch"] = [c for c in update["categories_watch"]
                                       if isinstance(c, str) and c in ALLOWED_CATEGORIES]
    for k in ("quiet_hours_start", "quiet_hours_end"):
        if k in update and re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", str(update[k])):
            current[k] = str(update[k])
    if "timezone" in update:
        try:
            ZoneInfo(str(update["timezone"]))
            current["timezone"] = str(update["timezone"])
        except ZoneInfoNotFoundError:
            pass
    db.set_json_setting("thresholds", current)
    return current


def compute_volume_stats(history: list[dict], window: int = 20) -> dict | None:
    """history ascending [{date, close, volume}]. Excludes the latest bar from the average."""
    if len(history) < 6:
        return None
    vols = [h["volume"] for h in history[:-1]][-window:]
    if not vols or statistics.mean(vols) == 0:
        return None
    last = history[-1]
    avg = statistics.mean(vols)
    return {
        "date": last["date"],
        "close": last["close"],
        "volume": last["volume"],
        "avg_volume": round(avg, 0),
        "volume_ratio": round(last["volume"] / avg, 2),
        "prev_close": history[-2]["close"] if len(history) > 1 else last["close"],
        "change_pct": round((last["close"] - history[-2]["close"]) / history[-2]["close"] * 100, 2)
        if len(history) > 1 and history[-2]["close"] else 0.0,
        "spark": [h["close"] for h in history[-30:]],
    }


def check_price_volume(ticker: str, thresholds: dict | None = None) -> list[dict]:
    """Evaluate the latest EOD bar for a ticker against thresholds. Returns alert dicts."""
    th = thresholds or get_thresholds()
    history = db.price_history(ticker, limit=40)
    stats = compute_volume_stats(history)
    if stats is None:
        return []
    alerts = []
    if stats["volume_ratio"] >= th["volume_multiplier"]:
        alerts.append({
            "ticker": ticker,
            "kind": "volume_spike",
            "priority": 2 if stats["volume_ratio"] >= th["volume_multiplier"] * 1.5 else 3,
            "why": (f"Today's volume is {stats['volume_ratio']:.1f}x the 20-day average; "
                    f"your threshold is {th['volume_multiplier']}x."),
            "payload": {"metric": "volume_ratio", "value": stats["volume_ratio"],
                        "threshold": th["volume_multiplier"], "close": stats["close"],
                        "change_pct": stats["change_pct"], "avg_volume": stats["avg_volume"],
                        "spark": stats["spark"], "date": stats["date"]},
        })
    if abs(stats["change_pct"]) >= th["price_move_pct"]:
        alerts.append({
            "ticker": ticker,
            "kind": "price_move",
            "priority": 2 if abs(stats["change_pct"]) >= th["price_move_pct"] * 1.5 else 3,
            "why": (f"Price moved {stats['change_pct']:+.1f}% today; your threshold is "
                    f"±{th['price_move_pct']}%."),
            "payload": {"metric": "change_pct", "value": stats["change_pct"],
                        "threshold": th["price_move_pct"], "close": stats["close"],
                        "spark": stats["spark"], "date": stats["date"]},
        })
    return alerts


BASE_TIER = {
    "results": 1, "M&A": 1, "management_change": 1, "litigation": 1, "pledging": 1,
    "fund_raise": 2, "insider_trading": 2, "capex": 2, "credit_rating": 2,
    "dividend": 3, "earnings_call": 3, "press_release": 3, "bonus_split": 3,
    "investor_meetings": 4, "postal_ballot": 4, "agm_egm": 4, "unclassified": 4,
}

# Headline wording that changes how much a filing matters, checked in order.
HEADLINE_RULES: list[tuple[re.Pattern, int, str]] = [
    (re.compile(r"esop|employee stock option|shareholding pattern|compliance certificate|"
                r"duplicate (share )?certificate|loss of share certificate|newspaper|trading window|"
                r"regulation 74|postal ballot result|egm result|agm result|schedule of analyst",
                re.I), 4, "routine paperwork"),
    (re.compile(r"intimation|to consider|will consider", re.I), 3,
     "a notice of an upcoming event, not the event itself"),
    (re.compile(r"reaffirm", re.I), 3, "a reaffirmed rating, so nothing changed"),
    (re.compile(r"commercial paper", re.I), 3, "routine short-term borrowing"),
    (re.compile(r"release of (shares )?pledge|pledge(d)? .*released|revocation of pledge", re.I), 3,
     "pledged shares were released, which lowers risk"),
    (re.compile(r"monthly business update", re.I), 3, "a regular monthly update"),
    (re.compile(r"secures? orders?|order (win|inflow)|bags? order", re.I), 2, "a new order win"),
    (re.compile(r"buyback", re.I), 2, "a buyback returns cash to shareholders"),
]

CATEGORY_WORDS = {
    "M&A": "an acquisition or merger", "management_change": "a leadership change",
    "litigation": "a legal or regulatory action", "results": "quarterly results",
    "pledging": "promoter share pledging", "fund_raise": "a fund raise",
    "insider_trading": "insider or promoter trading", "capex": "a capacity investment",
    "credit_rating": "a credit rating action", "dividend": "a dividend",
    "earnings_call": "an earnings call notice", "press_release": "a press release",
}


def announcement_priority(category: str, importance_hint: int | None = None,
                          thresholds: dict | None = None, headline: str = "") -> tuple[int, str]:
    """Map an announcement to a feed priority (1 = read now ... 4 = routine, counted) + reason."""
    th = thresholds or get_thresholds()
    base = BASE_TIER.get(category, 3)
    reason = CATEGORY_WORDS.get(category, "a corporate filing")
    for pattern, tier, why in HEADLINE_RULES:
        if headline and pattern.search(headline):
            base, reason = tier, why
            break
    if importance_hint and importance_hint <= 2 and base == 3:
        base = 2
    note = ""
    watched = th.get("categories_watch", [])
    if base < 4 and category in watched:
        note = " It is in a category you asked to watch."
    elif base < 4 and watched and category not in watched:
        base += 1
        note = " You do not watch this category, so it ranks lower."
    labels = {1: "Read now", 2: "Worth a look", 3: "Background", 4: "Routine"}
    why = f"{labels[base]}: {reason}.{note}"
    return base, why


def rescore_announcements() -> int:
    """Re-rank stored filing alerts with the current rules and the investor's settings."""
    import json

    th = get_thresholds()
    changed = 0
    with db.db() as c:
        rows = c.execute("SELECT id, payload, priority, why FROM alerts WHERE kind='announcement'").fetchall()
        for r in rows:
            p = json.loads(r["payload"])
            pri, why = announcement_priority(p.get("category") or "unclassified", None, th,
                                             p.get("headline") or "")
            if pri != r["priority"] or why != r["why"]:
                c.execute("UPDATE alerts SET priority=?, why=? WHERE id=?", (pri, why, r["id"]))
                changed += 1
    return changed


def in_quiet_hours(ts: datetime | None = None) -> bool:
    th = get_thresholds()
    ts = ts or datetime.now(timezone.utc)
    try:
        ts = ts.astimezone(ZoneInfo(th.get("timezone", "Asia/Kolkata")))
    except ZoneInfoNotFoundError:
        ts = ts.astimezone(timezone.utc)
    start = _parse_hhmm(th["quiet_hours_start"])
    end = _parse_hhmm(th["quiet_hours_end"])
    t = ts.time()
    if start <= end:
        return start <= t <= end
    return t >= start or t <= end  # window crosses midnight


def _parse_hhmm(s: str) -> time:
    try:
        h, m = s.split(":")
        return time(int(h), int(m))
    except Exception:
        return time(22, 0) if s == "quiet_hours_start" else time(7, 0)
