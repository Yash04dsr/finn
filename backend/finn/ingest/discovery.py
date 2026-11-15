"""Find and read any listed company's primary documents on demand.

Screener.in lists each company's earnings-call transcripts, investor presentations
and annual reports, mostly hosted on BSE or the issuer's own site. This module
reads that list, maps each call to the quarter it discusses, and downloads and
indexes the newest transcripts within a time budget, so research works for a
ticker FINN has never seen before.
"""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from .. import db
from ..config import DOCS_DIR

log = logging.getLogger("finn.discovery")

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"),
}
PAGE_TTL_S = 6 * 3600
_page_cache: dict[str, tuple[float, str]] = {}
MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}


def company_page(ticker: str) -> str | None:
    """The Screener company page, consolidated first, cached for a few hours."""
    cached = _page_cache.get(ticker)
    if cached and time.time() - cached[0] < PAGE_TTL_S:
        return cached[1]
    for url in (f"https://www.screener.in/company/{ticker}/consolidated/",
                f"https://www.screener.in/company/{ticker}/"):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code == 200 and 'id="quarters"' in resp.text:
                _page_cache[ticker] = (time.time(), resp.text)
                return resp.text
        except requests.RequestException as exc:
            log.warning("screener page failed for %s: %s", ticker, exc)
    return None


def call_period(month: str, year: int) -> str | None:
    """Map an earnings-call month to the quarter it discusses (Indian fiscal year).

    A call in Oct or Nov 2026 discusses the quarter ended Sep 2026, which is Q2 FY27.
    """
    m = MONTHS.get(month[:3].title())
    if not m:
        return None
    if m in (1, 2, 3):
        return f"Q3FY{str(year)[-2:]}"
    if m in (4, 5, 6):
        return f"Q4FY{str(year)[-2:]}"
    if m in (7, 8, 9):
        return f"Q1FY{str(year + 1)[-2:]}"
    return f"Q2FY{str(year + 1)[-2:]}"


def parse_documents(html: str) -> dict:
    """Calls (with transcript and presentation links) newest first, and annual reports."""
    soup = BeautifulSoup(html, "html.parser")
    section = soup.find("section", id="documents")
    calls, reports = [], []
    if not section:
        return {"calls": calls, "annual_reports": reports}
    concalls = section.find("div", class_="concalls") or section
    for li in concalls.find_all("li"):
        label = li.get_text(" ", strip=True)
        match = re.match(r"([A-Za-z]{3})\s+(\d{4})", label)
        if not match:
            continue
        links = {a.get_text(strip=True).lower(): a["href"] for a in li.find_all("a", href=True)}
        transcript = links.get("transcript")
        if not transcript or not transcript.startswith("http"):
            continue
        month, year = match.group(1), int(match.group(2))
        calls.append({
            "call_month": f"{month} {year}",
            "period": call_period(month, year),
            "transcript_url": transcript,
            "presentation_url": links.get("ppt") if str(links.get("ppt", "")).startswith("http") else None,
        })
    annual = section.find("div", class_="annual-reports") or section
    for a in annual.find_all("a", href=True):
        text = a.get_text(" ", strip=True)
        year = re.search(r"Annual Report\s+(\d{4})", text)
        if year and a["href"].lower().endswith(".pdf"):
            reports.append({"year": int(year.group(1)), "url": a["href"]})
    reports.sort(key=lambda r: -r["year"])
    return {"calls": calls, "annual_reports": reports}


def _ingested_urls(ticker: str) -> set[str]:
    with db.db() as c:
        return {r[0] for r in c.execute("SELECT DISTINCT url FROM chunks WHERE ticker=?", (ticker,))}


def _fetch_and_index(ticker: str, doc_type: str, title: str, period: str, url: str) -> int:
    from .docs import download_pdf, ingest_pdf

    safe = re.sub(r"[^A-Za-z0-9]", "", period or doc_type)
    local = DOCS_DIR / f"{ticker}_{doc_type}_{safe}_{abs(hash(url)) % 10**8}.pdf"
    if not (local.exists() and local.stat().st_size > 10_000) and not download_pdf(url, local):
        return 0
    return ingest_pdf(ticker, doc_type, title, period, url, local)


def ensure_research_docs(ticker: str, transcripts: int = 2, budget_s: float = 45.0,
                         include_annual_report: bool = False, progress=None) -> dict:
    """Index the newest call transcripts (and optionally the latest annual report).

    Already-indexed documents are skipped. Stops starting new downloads once the
    time budget is spent; whatever finished stays available.
    """
    started = time.time()
    html = company_page(ticker)
    if not html:
        return {"ticker": ticker, "status": "not_found", "documents": []}
    found = parse_documents(html)
    have = _ingested_urls(ticker)
    plan = []
    for call in found["calls"][:transcripts]:
        plan.append(("transcript", f"{ticker} {call['period']} earnings call transcript",
                     call["period"], call["transcript_url"]))
    if found["calls"] and found["calls"][0].get("presentation_url"):
        call = found["calls"][0]
        plan.append(("results_filing", f"{ticker} {call['period']} investor presentation",
                     call["period"], call["presentation_url"]))
    # Companies that hold no earnings calls still publish an annual report: read that instead.
    if (include_annual_report or not found["calls"]) and found["annual_reports"]:
        report = found["annual_reports"][0]
        plan.append(("annual_report", f"{ticker} Annual Report {report['year']}",
                     f"FY{str(report['year'])[-2:]}", report["url"]))

    documents = []
    for doc_type, title, period, url in plan:
        if url in have:
            documents.append({"doc_type": doc_type, "title": title, "period": period,
                              "url": url, "status": "ready"})
            continue
        if time.time() - started > budget_s:
            documents.append({"doc_type": doc_type, "title": title, "period": period,
                              "url": url, "status": "queued"})
            continue
        if progress:
            progress(f"Reading {title}")
        chunks = _fetch_and_index(ticker, doc_type, title, period, url)
        documents.append({"doc_type": doc_type, "title": title, "period": period, "url": url,
                          "status": "ready" if chunks else "failed", "chunks": chunks})
    if any(d["status"] == "ready" for d in documents):
        db.ensure_fts()
    return {"ticker": ticker, "status": "ok", "documents": documents,
            "elapsed_s": round(time.time() - started, 1)}


def coverage(ticker: str) -> dict:
    """What FINN can answer about a company right now."""
    counts = {
        "transcripts": db.chunk_count(ticker, "transcript"),
        "annual_reports": db.chunk_count(ticker, "annual_report"),
        "results": db.chunk_count(ticker, "results_filing"),
    }
    quarters = [r for r in db.quarterly_series(ticker, limit=8)
                if r.get("source") != "illustrative_snapshot"]
    if counts["transcripts"] or counts["annual_reports"]:
        level = "research_ready"
    elif quarters:
        level = "numbers_only"
    elif db.price_history(ticker, limit=1):
        level = "quote_only"
    else:
        level = "unavailable"
    return {"level": level, "chunks": counts, "verified_quarters": len(quarters)}


def local_path_ok(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 10_000
