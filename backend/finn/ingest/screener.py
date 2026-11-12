"""Fundamentals ingestion: quarterly headline numbers + document discovery via Screener.in.

Screener.in exposes company pages at https://www.screener.in/company/{TICKER}/consolidated/
with quarterly P&L tables and links to annual reports + concall transcripts.

Strategy:
1. Live scrape of the quarterly results table (best effort; the site may throttle).
2. Bundled JSON snapshot fallback for the demo corpus (data/snapshots/fundamentals.json).
3. Document links scraped live where possible; bundled manifest otherwise.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from ..config import DOCS_DIR, SNAPSHOT_DIR

log = logging.getLogger("finn.screener")

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
}

QUARTER_HEADERS = ["Revenue", "EBITDA", "PBT", "PAT"]


def scrape_quarterly(ticker: str) -> list[dict] | None:
    """Scrape the quarterly results table from Screener. Returns rows or None on failure."""
    url = f"https://www.screener.in/company/{ticker}/consolidated/"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        table = soup.find("section", id="quarters-section")
        if not table:
            return None
        table = table.find("table")
        heads = [th.get_text(strip=True) for th in table.find_all("th")]
        body_row = table.find_all("tr")
        data = {}
        for tr in body_row:
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if not cells:
                continue
            label = cells[0]
            nums = [_parse_num(c) for c in cells[1:]]
            if label in ("Sales", "Revenue"):
                data["revenue"] = nums
            elif label.startswith("Operating profit"):
                data["ebitda"] = nums
            elif label.startswith("Profit before tax"):
                data["pbt"] = nums
            elif label in ("Net profit", "Profit after tax"):
                data["pat"] = nums
        if "revenue" not in data:
            return None
        # heads[1:] are period labels like "Dec 2024", "Mar 2025", "Jun 2025", "Sep 2025"
        periods = heads[1:1 + len(data["revenue"])]
        rows = []
        n = len(periods)
        for i, period in enumerate(periods):
            def col(key):
                arr = data.get(key) or []
                return arr[i] if i < len(arr) else None
            rows.append({
                "period": _period_label(period),
                "period_end": _period_end_iso(period),
                "revenue": col("revenue"),
                "ebitda": col("ebitda"),
                "pbt": col("pbt"),
                "pat": col("pat"),
                "source": "screener",
            })
        rows = [row for row in rows if row["period_end"]]
        rows.sort(key=lambda row: row["period_end"])
        return rows[-8:]  # last 8 quarters, oldest to newest
    except Exception as exc:
        log.warning("Screener scrape failed for %s: %s", ticker, exc)
        return None


def _parse_num(s: str) -> float | None:
    s = s.replace(",", "").replace("%", "").strip()
    if s in ("", "-"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _period_label(s: str) -> str:
    """'Sep 2025' -> 'Q2FY26'; Indian FY ends March, so Q1=Jun, Q2=Sep, Q3=Dec, Q4=Mar."""
    m = re.fullmatch(r"([A-Za-z]{3})\s+(\d{4})", s.strip())
    if not m:
        return s
    mon, year = m.group(1).title(), int(m.group(2))
    month_q = {"Jun": 1, "Sep": 2, "Dec": 3, "Mar": 4}
    q = month_q.get(mon)
    if q is None:
        return s
    fy = year if mon == "Mar" else year + 1
    return f"Q{q}FY{str(fy)[-2:]}"


def _period_end_iso(s: str) -> str:
    m = re.fullmatch(r"([A-Za-z]{3})\s+(\d{4})", s.strip())
    if not m:
        return ""
    mon = m.group(1).title()
    month_day = {
        "Mar": ("03", "31"),
        "Jun": ("06", "30"),
        "Sep": ("09", "30"),
        "Dec": ("12", "31"),
    }
    if mon not in month_day:
        return ""
    month, day = month_day[mon]
    return f"{m.group(2)}-{month}-{day}"


def _normalise_quarterly_rows(rows: list[dict]) -> list[dict]:
    """Canonicalise fiscal labels/dates and sort chronologically for persistence."""
    normalised = []
    for row in rows:
        period = str(row.get("period") or "").upper()
        match = re.fullmatch(r"Q([1-4])FY(\d{2})", period)
        if not match:
            log.warning("dropping quarterly row with invalid period: %r", period)
            continue
        quarter, fy_short = int(match.group(1)), int(match.group(2))
        fy_year = 2000 + fy_short
        period_end = {
            1: f"{fy_year - 1:04d}-06-30",
            2: f"{fy_year - 1:04d}-09-30",
            3: f"{fy_year - 1:04d}-12-31",
            4: f"{fy_year:04d}-03-31",
        }[quarter]
        canonical = dict(row)
        canonical["period"] = period
        canonical["period_end"] = period_end
        normalised.append(canonical)
    return sorted(normalised, key=lambda row: row["period_end"])


def load_quarterly_snapshot(ticker: str) -> list[dict] | None:
    path = SNAPSHOT_DIR / "fundamentals.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    return data.get(ticker)


def ingest_quarterly(ticker: str) -> str:
    """Ingest quarterly numbers, live first then snapshot. Returns mode used."""
    from .. import db

    rows = scrape_quarterly(ticker)
    mode = "live"
    if not rows:
        rows = load_quarterly_snapshot(ticker)
        mode = "snapshot"
    if rows:
        rows = _normalise_quarterly_rows(rows)
        provenance = "screener_live" if mode == "live" else "illustrative_snapshot"
        for row in rows:
            row["source"] = provenance
    if rows:
        db.put_quarterly(ticker, rows)
    return mode if rows else "none"


# --- document links ---------------------------------------------------------------

def scrape_doc_links(ticker: str) -> list[dict]:
    """Scrape annual report / concall transcript links from a Screener company page."""
    url = f"https://www.screener.in/company/{ticker}/consolidated/"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        out = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(" ", strip=True)
            lower = href.lower()
            if ".pdf" in lower:
                dtype = None
                if "conc all" in lower or "transcript" in text.lower():
                    dtype = "transcript"
                elif "annual report" in text.lower() or "ar" == text.strip().lower():
                    dtype = "annual_report"
                elif "results" in text.lower():
                    dtype = "results_filing"
                if dtype:
                    out.append({"doc_type": dtype, "title": text, "url": href})
        # de-dupe by url
        seen, dedup = set(), []
        for d in out:
            if d["url"] not in seen:
                seen.add(d["url"])
                dedup.append(d)
        return dedup
    except Exception as exc:
        log.warning("doc links scrape failed for %s: %s", ticker, exc)
        return []


def load_docs_manifest(ticker: str) -> list[dict]:
    """Bundled docs manifest: [{doc_type,title,url,file}] where file is local PDF filename."""
    path = DOCS_DIR / "manifest.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return data.get(ticker, [])
