"""The Push pipeline (EOD run): fetch → classify → enrich → thresholds → digest → push.

Deterministic core (fetch, classify keywords, threshold math) with LLM used only
where language matters (batched classification of ambiguous items, one-liners,
digest composition). Every stage is observable and the whole run is idempotent.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from . import db
from .alerts import classifier, enrichers, engine
from .alerts.push import PushError, send_push
from .config import DEFAULT_WINDOW_HOURS, PORTFOLIO
from .ingest import nse_feed, prices as prices_ingest

log = logging.getLogger("finn.pipeline")


async def run_pipeline(hours: int = DEFAULT_WINDOW_HOURS, push: bool = True) -> dict:
    """One full EOD pass. Returns stats for the demo endpoint."""
    started = datetime.now(timezone.utc)

    # 1. Ingest announcements (live first, snapshot fallback) and prices.
    filings, mode = nse_feed.fetch_announcements()
    new_filings = []
    for f in filings:
        if db.upsert_filing(f["ticker"], f.get("category", "unclassified"), f["headline"],
                            f.get("body", ""), f["filed_at"],
                            source=f.get("source", "nse"), is_demo=(mode == "snapshot")):
            new_filings.append(f)
    if not new_filings:  # nothing new: re-read filings in window from DB
        since = (started - timedelta(hours=hours)).isoformat()
        new_filings = db.filings_since(since, tickers=PORTFOLIO)

    price_stats = prices_ingest.refresh_all_prices(days=60)

    # 1b. Ingest quarterly fundamentals (live Screener first, snapshot fallback)
    from .ingest.screener import ingest_quarterly
    for t in PORTFOLIO + ["IRCTC", "IRFC", "PAYTM", "SUZLON"]:
        try:
            ingest_quarterly(t)
        except Exception as exc:
            log.warning("quarterly ingest failed for %s: %s", t, exc)

    # 2. Classify (hybrid).
    classified = await classifier.classify_batch(new_filings)
    for f, c in zip(new_filings, classified):
        # persist the classification (upsert again with category set)
        db.upsert_filing(f["ticker"], c["category"], f["headline"], f.get("body", ""),
                         f["filed_at"], source=f.get("source", "nse"),
                         is_demo=(mode == "snapshot"))

    # 3. Enrich material items only (cost discipline: no LLM on routine paperwork).
    enriched = []
    for c in classified:
        pri, why = engine.announcement_priority(c["category"],
                                                c.get("importance"),
                                                engine.get_thresholds())
        item = {**c, "priority": pri, "why": why}
        if c["category"] == "results" and pri <= 2:
            item.update(await enrichers.enrich_results(c["ticker"], c))
        elif c["category"] == "management_change" and pri <= 2:
            item.update(await enrichers.enrich_management_change(c["ticker"], c))
        elif pri <= 3:
            item.update(await enrichers.enrich_generic(c["ticker"], c))
        enriched.append(item)

    # 4. Price/volume threshold alerts.
    th = engine.get_thresholds()
    threshold_alerts = []
    for t in PORTFOLIO:
        threshold_alerts.extend(engine.check_price_volume(t, th))

    # 5. Store alerts.
    for item in enriched:
        if item["priority"] <= 4:
            payload = {
                "category": item.get("category"),
                "headline": item.get("headline"),
                "summary": item.get("summary"),
                "filed_at": item.get("filed_at"),
                "filing_url": (item.get("body") or "") if (item.get("body") or "").startswith("http") else None,
            }
            if item.get("facts"):
                payload["facts"] = item["facts"]
            if item.get("bio"):
                payload["bio"] = item["bio"]
            db.add_alert(item["ticker"], "announcement", payload, item["priority"], item["why"])
    for a in threshold_alerts:
        db.add_alert(a["ticker"], a["kind"], a["payload"], a["priority"], a["why"])

    # 6. Compose the windowed digest (deterministic composer).
    from .alerts.digest import compose_digest
    digest = compose_digest(enriched, threshold_alerts, hours=hours)
    db.save_digest(started.isoformat(), datetime.now(timezone.utc).isoformat(), digest)

    # 7. Push the top item(s) unless quiet hours.
    pushed = 0
    if push and not engine.in_quiet_hours():
        try:
            pushed = await send_push(digest, enriched, threshold_alerts)
        except PushError as exc:
            log.warning("push failed: %s", exc)

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    return {
        "ok": True,
        "mode": mode,
        "filings_seen": len(filings),
        "new_filings": len(new_filings),
        "threshold_alerts": len(threshold_alerts),
        "digest_items": len(digest.get("items", [])),
        "digest_stats": digest.get("stats"),
        "pushed": pushed,
        "elapsed_s": round(elapsed, 1),
    }
