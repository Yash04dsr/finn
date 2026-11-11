"""Portfolio tool: holdings snapshot for the agent + API."""
from __future__ import annotations

from .. import db
from ..config import ADHOC, PORTFOLIO


def portfolio_snapshot() -> list[dict]:
    out = []
    for t in PORTFOLIO:
        snap = db.price_history(t, limit=2)
        close = snap[-1]["close"] if snap else None
        change = None
        if len(snap) == 2 and snap[-2]["close"]:
            change = round((snap[-1]["close"] - snap[-2]["close"]) / snap[-2]["close"] * 100, 2)
        out.append({"ticker": t, "close": close, "change_pct": change})
    return out


def adhoc_snapshot() -> list[dict]:
    out = []
    for t in ADHOC:
        snap = db.price_history(t, limit=2)
        close = snap[-1]["close"] if snap else None
        change = None
        if len(snap) == 2 and snap[-2]["close"]:
            change = round((snap[-1]["close"] - snap[-2]["close"]) / snap[-2]["close"] * 100, 2)
        out.append({"ticker": t, "close": close, "change_pct": change})
    return out
