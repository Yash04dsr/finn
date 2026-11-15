"""Find and read any listed company's primary documents on demand.

Screener.in lists each company's earnings-call transcripts, investor presentations
and annual reports, mostly hosted on BSE or the issuer's own site. This module
reads that list, maps each call to the quarter it discusses, and downloads and
indexes the newest transcripts within a time budget, so research works for a
ticker FINN has never seen before.
"""
from __future__ import annotations

import hashlib
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as FuturesTimeout
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from .. import db, state
from ..config import PDF_DIR

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


def _local_pdf(ticker: str, doc_type: str, period: str, url: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9]", "", period or doc_type)
    digest = hashlib.sha256(url.encode()).hexdigest()[:10]
    return PDF_DIR / f"{ticker}_{doc_type}_{safe}_{digest}.pdf"


def _download(ticker: str, doc_type: str, period: str, url: str, timeout_s: float) -> Path | None:
    from .docs import download_pdf

    local = _local_pdf(ticker, doc_type, period, url)
    if local_path_ok(local) or download_pdf(url, local, timeout=timeout_s):
        return local
    return None


def _index(ticker: str, doc_type: str, title: str, period: str, url: str, local: Path) -> int:
    from .docs import ingest_pdf

    chunks = ingest_pdf(ticker, doc_type, title, period, url, local)
    if chunks:
        state.record_document(ticker, url)
    return chunks


def ensure_research_docs(ticker: str, transcripts: int = 2, budget_s: float = 45.0,
                         include_annual_report: bool = False, progress=None) -> dict:
    """Index the newest call transcripts (and optionally the latest annual report).

    Documents already indexed here, or read by another instance, are skipped. The rest
    download in parallel, each bounded by what is left of the time budget, and are read
    as they arrive; anything still missing when the budget runs out is reported as queued.
    """
    started = time.time()
    state.restore_company(ticker)
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

    documents = {url: {"doc_type": doc_type, "title": title, "period": period, "url": url,
                       "status": "ready" if url in have else "queued"}
                 for doc_type, title, period, url in plan}
    todo = [p for p in plan if p[3] not in have]
    remaining = budget_s - (time.time() - started)
    if todo and remaining > 1:
        if progress:
            progress(f"Downloading {len(todo)} document{'s' if len(todo) > 1 else ''}")
        pool = ThreadPoolExecutor(max_workers=min(4, len(todo)))
        futures = {pool.submit(_download, ticker, doc_type, period, url, max(5.0, remaining - 2)):
                   (doc_type, title, period, url) for doc_type, title, period, url in todo}
        read = 0
        try:
            for fut in as_completed(futures, timeout=remaining):
                doc_type, title, period, url = futures[fut]
                local = fut.result()
                if local is None:
                    documents[url]["status"] = "failed"
                    continue
                read += 1
                if progress:
                    progress(f"Reading {title} ({read} of {len(todo)})")
                chunks = _index(ticker, doc_type, title, period, url, local)
                documents[url].update(status="ready" if chunks else "failed", chunks=chunks)
        except FuturesTimeout:
            log.warning("document budget spent for %s; %d still downloading", ticker,
                        sum(1 for d in documents.values() if d["status"] == "queued"))
        finally:
            pool.shutdown(wait=False, cancel_futures=True)
    docs = list(documents.values())
    if any(d.get("chunks") for d in docs):
        db.ensure_fts()
    return {"ticker": ticker, "status": "ok", "documents": docs,
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
