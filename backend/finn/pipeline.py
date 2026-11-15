"""The Push pipeline (EOD run): fetch → classify → enrich → thresholds → digest → push.

Deterministic core (fetch, classify keywords, threshold math) with LLM used only
where language matters (batched classification of ambiguous items, one-liners).
Every stage is observable and the whole run is idempotent: a rerun refreshes
existing alerts and never adds copies.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from . import db
from .alerts import classifier, enrichers, engine
from .alerts.digest import compose_from_alerts
from .alerts.push import PushError, send_push
from .config import DEFAULT_WINDOW_HOURS
from .ingest import nse_feed, prices as prices_ingest
from .tools import portfolio as portfolio_tools

log = logging.getLogger("finn.pipeline")


def announcement_key(ticker: str, headline: str, filed_at: str, is_sample: bool) -> str:
    """Stable identity for a filing alert.

    Sample-day filings move to a fresh timestamp on every run, so their identity
    leaves the time out; live filings keep it because companies reuse headlines.
    """
    parts = ("announcement", ticker, headline) if is_sample else (
        "announcement", ticker, filed_at, headline)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


def _rekey_sample_alerts(watched: list[str]) -> None:
    """Move sample-day alerts saved by older builds onto the time-free identity,
    and drop sample alerts for companies the investor does not watch."""
    with db.db() as c:
        marks = ",".join("?" for _ in watched)
        c.execute(f"DELETE FROM alerts WHERE kind='announcement' AND ticker NOT IN ({marks})"
                  " AND ticker IN (SELECT ticker FROM filings WHERE is_demo=1)", watched)
        sample = {(r["ticker"], r["headline"]) for r in
                  c.execute("SELECT ticker, headline FROM filings WHERE is_demo=1")}
        for row in c.execute("SELECT id, ticker, payload, source_key FROM alerts WHERE kind='announcement'"):
            payload = db.json.loads(row["payload"])
            headline = payload.get("headline") or ""
            if (row["ticker"], headline) not in sample:
                continue
            key = announcement_key(row["ticker"], headline, "", True)
            if key != row["source_key"]:
                payload.update({"is_sample": True, "source": "sample", "source_key": key})
                c.execute("UPDATE OR IGNORE alerts SET source_key=?, payload=? WHERE id=?",
                          (key, db.json.dumps(payload), row["id"]))


def _drop_stale_sample(current: list[dict]) -> None:
    """Remove sample filings and alerts whose wording no longer matches the sample day,
    such as results headlines naming an older quarter."""
    keep = {(f["ticker"], f["headline"]) for f in current}
    with db.db() as c:
        for row in c.execute("SELECT id, ticker, headline FROM filings WHERE is_demo=1").fetchall():
            if (row["ticker"], row["headline"]) not in keep:
                c.execute("DELETE FROM filings WHERE id=?", (row["id"],))
        for row in c.execute("SELECT id, ticker, payload FROM alerts WHERE kind='announcement'").fetchall():
            payload = db.json.loads(row["payload"])
            if payload.get("is_sample") and (row["ticker"], payload.get("headline") or "") not in keep:
                c.execute("DELETE FROM verdicts WHERE alert_id=?", (row["id"],))
                c.execute("DELETE FROM alerts WHERE id=?", (row["id"],))


def _ingest_fundamentals(tickers: list[str]) -> None:
    from concurrent.futures import ThreadPoolExecutor

    from .ingest.screener import ingest_quarterly

    def one(ticker: str) -> None:
        try:
            ingest_quarterly(ticker)
        except Exception as exc:
            log.warning("quarterly ingest failed for %s: %s", ticker, exc)

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(one, tickers))


async def run_pipeline(hours: int = DEFAULT_WINDOW_HOURS, push: bool = True,
                       sample: bool = False) -> dict:
    """One full EOD pass. `sample=True` loads the labelled sample day instead of NSE."""
    started = datetime.now(timezone.utc)
    watched = portfolio_tools.watched_tickers()

    # 1. Ingest prices and fundamentals, then announcements. The sample day names each
    #    company's latest stored quarter, so the numbers have to be in first.
    research = portfolio_tools.research_tickers()
    await asyncio.to_thread(prices_ingest.refresh_all_prices, 60, research)
    await asyncio.to_thread(_ingest_fundamentals, research)
    filings, mode = nse_feed.fetch_announcements(
        snapshot_anchor=started if sample else None, sample=sample, tickers=set(watched),
    )
    is_sample = mode == "sample"
    if is_sample:
        _drop_stale_sample(filings)
        _rekey_sample_alerts(watched)
    new_filings, seen_filings = [], []
    for f in filings:
        inserted = db.upsert_filing(
            f["ticker"], f.get("category", "unclassified"), f["headline"],
            f.get("body", ""), f["filed_at"], source=f.get("source", "nse"), is_demo=is_sample,
        )
        (new_filings if inserted else seen_filings).append(f)

    # 2. Classify only what is new (hybrid: keywords first, one batched call for the rest).
    classified = await classifier.classify_batch(new_filings)
    for f, c in zip(new_filings, classified):
        db.upsert_filing(f["ticker"], c["category"], f["headline"], f.get("body", ""),
                         f["filed_at"], source=f.get("source", "nse"), is_demo=is_sample)

    # 3. Enrich material items only (cost discipline: no LLM on routine paperwork).
    enriched = []
    for c in classified:
        pri, why = engine.announcement_priority(c["category"], c.get("importance"),
                                                engine.get_thresholds(), c.get("headline", ""))
        item = {**c, "priority": pri, "why": why}
        if c["category"] == "results" and pri <= 2 and not engine.is_advance_notice(c.get("headline", "")):
            item.update(await enrichers.enrich_results(c["ticker"], c))
        elif c["category"] == "management_change" and pri <= 2:
            item.update(await enrichers.enrich_management_change(c["ticker"], c))
        elif pri <= 3:
            item.update(await enrichers.enrich_generic(c["ticker"], c))
        enriched.append(item)

    # 4. Price/volume threshold alerts against the investor's own thresholds.
    th = engine.get_thresholds()
    threshold_alerts = []
    for t in watched:
        threshold_alerts.extend(engine.check_price_volume(t, th))

    # 5. Store alerts under stable keys so reruns refresh instead of duplicating.
    new_alerts = 0
    for item in enriched:
        if item["priority"] > 4:
            continue
        body = item.get("body") or ""
        source_key = announcement_key(item["ticker"], item.get("headline", ""),
                                      item.get("filed_at", ""), is_sample)
        payload = {
            "category": item.get("category"),
            "headline": item.get("headline"),
            "summary": item.get("summary"),
            "filed_at": item.get("filed_at"),
            "source_key": source_key,
            "source": "sample" if is_sample else item.get("source", "nse"),
            "is_sample": is_sample,
            "filing_url": body if body.startswith("http") else None,
        }
        if item.get("facts"):
            payload["facts"] = item["facts"]
        if item.get("bio"):
            payload["bio"] = item["bio"]
        existed = db.alert_source_exists(source_key)
        db.add_alert(item["ticker"], "announcement", payload, item["priority"], item["why"],
                     source_key=source_key)
        new_alerts += int(not existed)
    for f in seen_filings:
        source_key = announcement_key(f["ticker"], f["headline"], f["filed_at"], is_sample)
        if db.alert_source_exists(source_key):
            db.add_alert(f["ticker"], "announcement", {"filed_at": f["filed_at"]}, 4,
                         source_key=source_key)
    for a in threshold_alerts:
        raw_key = "|".join((a["kind"], a["ticker"], str(a["payload"].get("date", ""))))
        source_key = hashlib.sha256(raw_key.encode()).hexdigest()
        existed = db.alert_source_exists(source_key)
        db.add_alert(a["ticker"], a["kind"], a["payload"], a["priority"], a["why"],
                     source_key=source_key)
        new_alerts += int(not existed)

    # 6. Re-rank with the current settings, then compose the digest for the window.
    engine.rescore_announcements()
    window_alerts = db.feed(since_hours=hours, include_read=True)
    digest = compose_from_alerts(window_alerts, hours=hours)
    digest_key = hashlib.sha256(
        f"{hours}|{'|'.join(sorted(str(a['id']) for a in window_alerts))}".encode()
    ).hexdigest()
    db.save_digest((started - timedelta(hours=hours)).isoformat(), started.isoformat(),
                   digest, source_key=digest_key)

    # 7. Push the top item(s) unless quiet hours, and only when something is new.
    pushed = 0
    if push and new_alerts > 0 and not engine.in_quiet_hours():
        try:
            pushed = await send_push(digest, enriched, threshold_alerts)
        except PushError as exc:
            log.warning("push failed: %s", exc)

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    return {
        "ok": True,
        "mode": mode,
        "is_sample": is_sample,
        "filings_seen": len(filings),
        "new_filings": len(new_filings),
        "new_alerts": new_alerts,
        "threshold_alerts": len(threshold_alerts),
        "digest_items": len(digest.get("items", [])),
        "digest_stats": digest.get("stats"),
        "pushed": pushed,
        "elapsed_s": round(elapsed, 1),
    }
