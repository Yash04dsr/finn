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
        # Ticker.history keeps state per instance, so it is safe to call from worker threads.
        df = yf.Ticker(f"{ticker}.NS").history(period=f"{days}d", interval="1d", auto_adjust=False)
        if df is None or df.empty:
            df = yf.Ticker(f"{ticker}.BO").history(period=f"{days}d", interval="1d", auto_adjust=False)
        if df is None or df.empty:
            return []
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


def refresh_all_prices(days: int = 60, tickers: list[str] | None = None) -> dict:
    """Pull EOD bars for every tracked ticker into SQLite, a few tickers at a time."""
    from concurrent.futures import ThreadPoolExecutor

    symbols = tickers or ALL_TICKERS
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = dict(zip(symbols, pool.map(lambda t: fetch_eod(t, days=days), symbols)))
    stats = {}
    for t, rows in results.items():
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
