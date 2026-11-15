"""Portfolio tool: holdings, the investor's own watchlist, and price snapshots."""
from __future__ import annotations

from .. import db
from ..config import ADHOC, PORTFOLIO

WATCHLIST_KEY = "watchlist_extra"


def watchlist_extra() -> list[str]:
    """Tickers the investor added in the app, beyond the demo portfolio."""
    raw = db.get_json_setting(WATCHLIST_KEY, {"tickers": []})
    return [t for t in raw.get("tickers", []) if isinstance(t, str)]


def add_to_watchlist(ticker: str) -> list[str]:
    current = watchlist_extra()
    if ticker not in current and ticker not in PORTFOLIO:
        current.append(ticker)
        db.set_json_setting(WATCHLIST_KEY, {"tickers": current[-20:]})
    return watchlist_extra()


def remove_from_watchlist(ticker: str) -> list[str]:
    current = [t for t in watchlist_extra() if t != ticker]
    db.set_json_setting(WATCHLIST_KEY, {"tickers": current})
    return current


def watched_tickers() -> list[str]:
    """Everything the push pipeline watches: the portfolio plus the investor's additions."""
    return list(dict.fromkeys(PORTFOLIO + watchlist_extra()))


def research_tickers() -> list[str]:
    """Everything with a quote and fundamentals kept fresh."""
    return list(dict.fromkeys(PORTFOLIO + ADHOC + watchlist_extra()))


def _snapshot(tickers: list[str]) -> list[dict]:
    out = []
    for t in tickers:
        snap = db.price_history(t, limit=2)
        close = snap[-1]["close"] if snap else None
        change = None
        if len(snap) == 2 and snap[-2]["close"]:
            change = round((snap[-1]["close"] - snap[-2]["close"]) / snap[-2]["close"] * 100, 2)
        out.append({"ticker": t, "close": close, "change_pct": change})
    return out


def portfolio_snapshot() -> list[dict]:
    return _snapshot(PORTFOLIO)


def adhoc_snapshot() -> list[dict]:
    return _snapshot(list(dict.fromkeys(ADHOC + watchlist_extra())))
