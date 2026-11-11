"""Price tool for the research agent: recent EOD context for a ticker."""
from __future__ import annotations

import json

from .. import db


def price_context(ticker: str) -> str:
    """Last 10 EOD bars + computed momentum stats, as JSON for the agent."""
    hist = db.price_history(ticker, limit=11)
    if not hist:
        return json.dumps({"status": "no_data", "note": f"No stored prices for {ticker}."})
    last, prev = hist[-1], hist[-2] if len(hist) > 1 else hist[-1]
    vols = [h["volume"] for h in hist[:-1]] or [0]
    avg_vol = sum(vols) / len(vols) if vols else 0
    return json.dumps({
        "ticker": ticker,
        "bars": [{"date": h["date"], "close": h["close"], "volume": h["volume"]} for h in hist],
        "latest_close": last["close"],
        "daily_change_pct": round((last["close"] - prev["close"]) / prev["close"] * 100, 2)
        if prev["close"] else 0,
        "volume_vs_avg": round(last["volume"] / avg_vol, 2) if avg_vol else None,
    })


def price_context_wrapped(ticker: str) -> dict:
    """Recent end-of-day price/volume context for a ticker (last ~10 sessions)."""
    return json.loads(price_context(ticker))
