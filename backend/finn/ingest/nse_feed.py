"""NSE corporate announcements fetcher with a bundled snapshot fallback.

Strategy:
1. Live scrape of NSE's public announcement API (no auth, browser-like headers).
2. If it fails (NSE blocks datacenter IPs aggressively), fall back to a bundled
   snapshot so the demo never dies. Snapshots ship as JSON in data/snapshots/.
"""
from __future__ import annotations

import json
import logging
import re
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
    rows = fill_sample(snap, snapshot_anchor)
    return _redate(rows, anchor=snapshot_anchor), "sample"


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
               "September", "October", "November", "December"]


def fill_sample(rows: list[dict], anchor: datetime | None = None) -> list[dict]:
    """Date the sample day's wording to each company's latest stored quarter.

    A sample results filing then names the same quarter its first-cut numbers and
    promise check are computed from, instead of a fixed past quarter.
    """
    now = anchor or datetime.now(timezone.utc)
    fields: dict[str, dict[str, str]] = {}
    out = []
    for r in rows:
        values = fields.setdefault(r["ticker"], sample_fields(r["ticker"], now))
        filled = dict(r, source="sample")
        for key in ("headline", "body"):
            text = str(filled.get(key) or "")
            for name, value in values.items():
                text = text.replace("{" + name + "}", value)
            filled[key] = text
        out.append(filled)
    return out


def sample_fields(ticker: str, now: datetime) -> dict[str, str]:
    from .. import db

    latest = db.quarterly_series(ticker, limit=1)
    if latest and re.fullmatch(r"Q[1-4]FY\d{2}", latest[-1]["period"]):
        quarter, fy = int(latest[-1]["period"][1]), int(latest[-1]["period"][4:])
    else:
        # The last quarter that ended before the anchor, in the Indian fiscal year.
        q_month = ((now.month - 1) // 3) * 3 or 12
        year = now.year if q_month != 12 else now.year - 1
        quarter = {6: 1, 9: 2, 12: 3, 3: 4}[q_month]
        fy = (year + (0 if quarter == 4 else 1)) % 100
    end_month = {1: 6, 2: 9, 3: 12, 4: 3}[quarter]
    end_year = 2000 + fy - (0 if quarter == 4 else 1)
    end_day = {3: 31, 6: 30, 9: 30, 12: 31}[end_month]
    nq, nfy = (quarter + 1, fy) if quarter < 4 else (1, fy + 1)
    prev_month = (now.month - 2) % 12 + 1
    prev_year = now.year if now.month > 1 else now.year - 1
    return {
        "quarter": f"Q{quarter} FY{fy:02d}",
        "quarter_end": f"{MONTH_NAMES[end_month - 1]} {end_day}, {end_year}",
        "next_quarter": f"Q{nq} FY{nfy:02d}",
        "last_month": f"{MONTH_NAMES[prev_month - 1]} {prev_year}",
    }


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
