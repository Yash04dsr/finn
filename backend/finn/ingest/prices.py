"""End-of-day price & volume via yfinance."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from .. import db
from ..config import ALL_TICKERS

log = logging.getLogger("finn.prices")


def fetch_eod(ticker: str, days: int = 60) -> list[dict]:
    """Fetch EOD bars for ONE ticker; returns ascending [{date, close, volume}]."""
    import yfinance as yf

    try:
        df = yf.download(f"{ticker}.NS", period=f"{days}d", interval="1d",
                         progress=False, auto_adjust=False)
        if df is None or df.empty:
            # try BSE
            df = yf.download(f"{ticker}.BO", period=f"{days}d", interval="1d",
                             progress=False, auto_adjust=False)
        if df is None or df.empty:
            return []
        if hasattr(df.columns, "get_level_values") and df.columns.nlevels > 1:
            df.columns = df.columns.get_level_values(0)
        out = []
        for idx, row in df.iterrows():
            out.append({
                "date": str(idx.date()),
                "close": round(float(row["Close"]), 2),
                "volume": float(row["Volume"]),
            })
        return out
    except Exception as exc:
        log.warning("yfinance failed for %s: %s", ticker, exc)
        return []


def refresh_all_prices(days: int = 60) -> dict:
    """Pull EOD bars for every tracked ticker into SQLite."""
    stats = {}
    for t in ALL_TICKERS:
        rows = fetch_eod(t, days=days)
        for r in rows:
            db.put_price(t, r["date"], r["close"], r["volume"])
        stats[t] = len(rows)
    return stats


def price_snapshot(ticker: str) -> dict | None:
    """Latest price + simple stats for UI headers."""
    hist = db.price_history(ticker, limit=2)
    if not hist:
        return None
    last = hist[-1]
    prev_close = hist[-2]["close"] if len(hist) > 1 else last["close"]
    change_pct = ((last["close"] - prev_close) / prev_close * 100) if prev_close else 0.0
    return {
        "ticker": ticker,
        "date": last["date"],
        "close": last["close"],
        "change_pct": round(change_pct, 2),
    }
