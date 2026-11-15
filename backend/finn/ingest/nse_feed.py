"""NSE corporate announcements fetcher with a bundled snapshot fallback.

Strategy:
1. Live scrape of NSE's public announcement API (no auth, browser-like headers).
2. If it fails (NSE blocks datacenter IPs aggressively), fall back to a bundled
   snapshot so the demo never dies. Snapshots ship as JSON in data/snapshots/.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from ..config import ALL_TICKERS, SNAPSHOT_DIR

log = logging.getLogger("finn.nse")

NSE_ANNOUNCE_URL = "https://www.nseindia.com/api/corporate-announcements?index=equities"

BROWSER_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
    "Accept": "application/json",
    "Referer": "https://www.nseindia.com/all-news",
}


def _normalize(rec: dict) -> dict | None:
    """Map an NSE API record into our filing shape."""
    try:
        symbol = (rec.get("symbol") or rec.get("Symbol") or "").strip().upper()
        headline = (rec.get("desc") or rec.get("Desc") or "").strip()
        filed = (rec.get("filedAt") or rec.get("date") or "").strip()
        attachment = rec.get("attchmntFile") or rec.get("attchmntFileNm") or ""
        if not symbol or not headline:
            return None
        filed_at = _parse_nse_time(filed)
        return {
            "ticker": symbol,
            "headline": headline,
            "body": attachment if isinstance(attachment, str) else "",
            "filed_at": filed_at,
            "source": "nse",
        }
    except Exception:
        return None


IST = timezone(timedelta(hours=5, minutes=30))


def _parse_nse_time(raw: str) -> str:
    """NSE gives '11-Nov-2026 18:05:00' in India time; normalize to ISO UTC."""
    fmts = ["%d-%b-%Y %H:%M:%S", "%d %b %Y %H:%M", "%d-%b-%Y %H:%M"]
    for fmt in fmts:
        try:
            dt = datetime.strptime(raw.strip(), fmt).replace(tzinfo=IST)
            return dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return datetime.now(timezone.utc).isoformat()


def fetch_live_announcements(tickers: set[str] | None = None) -> list[dict] | None:
    """Scrape NSE announcements for the watched tickers.

    Returns None when the exchange could not be reached, and an empty list on a
    quiet day, so a quiet day is never mistaken for an outage.
    """
    watched = tickers or set(ALL_TICKERS)
    s = requests.Session()
    s.headers.update(BROWSER_HEADERS)
    try:
        s.get("https://www.nseindia.com", timeout=8)
        resp = s.get(NSE_ANNOUNCE_URL, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        rows = data if isinstance(data, list) else data.get("data", [])
        out = []
        for rec in rows:
            norm = _normalize(rec)
            if norm and norm["ticker"] in watched:
                out.append(norm)
        log.info("NSE live: %d announcements for watched tickers", len(out))
        return out
    except Exception as exc:
        log.warning("NSE live fetch failed: %s", exc)
        return None


def load_snapshot() -> list[dict]:
    """Load bundled snapshot filings (demo corpus)."""
    path = SNAPSHOT_DIR / "announcements.json"
    if not path.exists():
        return []
    rows = json.loads(path.read_text())
    return rows


def fetch_announcements(snapshot_anchor: datetime | None = None, sample: bool = False,
                        tickers: set[str] | None = None) -> tuple[list[dict], str]:
    """Returns (filings, mode) where mode is 'live', 'sample', or 'unavailable'.

    The sample day is only used when asked for. A live outage returns nothing
    rather than passing sample filings off as today's activity.
    """
    if not sample:
        live = fetch_live_announcements(tickers)
        if live is None:
            return [], "unavailable"
        return live, "live"
    snap = [r for r in load_snapshot() if not tickers or r["ticker"] in tickers]
    log.info("Using the labelled sample day (%d filings)", len(snap))
    rows = [{**r, "source": "sample"} for r in snap]
    return _redate(rows, anchor=snapshot_anchor), "sample"


def _redate(rows: list[dict], hours_back: int = 20,
            anchor: datetime | None = None) -> list[dict]:
    """Spread snapshot filings over the last `hours_back` hours so the 24h digest is populated."""
    now = anchor or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    out = []
    n = max(len(rows), 1)
    for i, r in enumerate(rows):
        offset_h = hours_back - (i % hours_back)
        ts = now - timedelta(hours=offset_h, minutes=(i * 7) % 60)
        out.append({**r, "filed_at": ts.isoformat()})
    return out
