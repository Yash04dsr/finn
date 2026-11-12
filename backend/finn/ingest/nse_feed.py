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


def _parse_nse_time(raw: str) -> str:
    """NSE gives '11-Nov-2026 18:05:00'; normalize to ISO UTC."""
    fmts = ["%d-%b-%Y %H:%M:%S", "%d %b %Y %H:%M", "%d-%b-%Y %H:%M"]
    for fmt in fmts:
        try:
            dt = datetime.strptime(raw.strip(), fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    return datetime.now(timezone.utc).isoformat()


def fetch_live_announcements() -> list[dict]:
    """Scrape NSE announcements. Requires a warmed session (NSE sets cookies on homepage)."""
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
            if norm and norm["ticker"] in ALL_TICKERS:
                out.append(norm)
        if out:
            log.info("NSE live: %d announcements for tracked tickers", len(out))
        return out
    except Exception as exc:
        log.warning("NSE live fetch failed: %s", exc)
        return []


def load_snapshot() -> list[dict]:
    """Load bundled snapshot filings (demo corpus)."""
    path = SNAPSHOT_DIR / "announcements.json"
    if not path.exists():
        return []
    rows = json.loads(path.read_text())
    return rows


def fetch_announcements(snapshot_anchor: datetime | None = None) -> tuple[list[dict], str]:
    """Returns (filings, mode) where mode is 'live' or 'snapshot'."""
    live = fetch_live_announcements()
    if live:
        return live, "live"
    snap = load_snapshot()
    mode = "snapshot" if snap else "none"
    log.info("Using %s announcements snapshot (%d rows)", mode, len(snap))
    # Re-date against a persisted anchor supplied by the pipeline. Reusing the
    # anchor makes repeated demo runs produce the same filing identities.
    return _redate(snap, anchor=snapshot_anchor), mode


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
