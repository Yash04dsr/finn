"""Regression tests for public-demo reliability and repeat-run idempotency."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from finn import db
from finn.api.main import _parse_db_time
from finn.ingest.nse_feed import _redate
from finn.pipeline import run_pipeline
from finn.llm import routing


def test_filing_upsert_updates_classification_without_becoming_new():
    filed_at = "2026-11-12T09:30:00+00:00"
    assert db.upsert_filing(
        "TESTCO", "unclassified", "Quarterly results", "", filed_at
    )
    assert not db.upsert_filing(
        "TESTCO", "results", "Quarterly results", "https://example.test", filed_at
    )
    row = db.recent_filings("TESTCO", limit=1)[0]
    assert row["category"] == "results"
    assert row["body"] == "https://example.test"


def test_alert_and_digest_source_keys_are_idempotent():
    key = "alert:test:stable"
    first = db.add_alert(
        "TESTCO", "announcement", {"headline": "Stable"}, 1, source_key=key
    )
    second = db.add_alert(
        "TESTCO", "announcement", {"headline": "Changed copy"}, 1, source_key=key
    )
    assert first == second
    assert db.alert_source_exists(key)

    digest_key = "digest:test:stable"
    d1 = db.save_digest("a", "b", {"items": [1]}, source_key=digest_key)
    d2 = db.save_digest("a", "c", {"items": [2]}, source_key=digest_key)
    assert d1 == d2


def test_sqlite_and_iso_timestamps_parse_to_utc():
    sqlite_time = _parse_db_time("2026-11-12 10:20:30")
    iso_time = _parse_db_time("2026-11-12T10:20:30+00:00")
    assert sqlite_time == iso_time
    assert sqlite_time.tzinfo == timezone.utc
    assert sqlite_time < datetime(2026, 11, 13, tzinfo=timezone.utc)


def test_snapshot_redating_is_stable_for_persisted_anchor():
    rows = [{"ticker": "TESTCO", "headline": "Notice"}]
    anchor = datetime(2026, 11, 12, 8, 30, tzinfo=timezone.utc)
    assert _redate(rows, anchor=anchor) == _redate(rows, anchor=anchor)


@pytest.mark.asyncio
async def test_pipeline_rerun_does_not_duplicate_alerts_or_digest(monkeypatch):
    filing = {
        "ticker": "PIPECO",
        "category": "press_release",
        "headline": "Stable demo announcement",
        "body": "",
        "filed_at": "2026-11-12T08:00:00+00:00",
        "source": "snapshot",
    }
    monkeypatch.setattr(
        "finn.pipeline.nse_feed.fetch_announcements",
        lambda snapshot_anchor=None: ([filing], "snapshot"),
    )
    monkeypatch.setattr(
        "finn.pipeline.prices_ingest.refresh_all_prices", lambda days=60: {}
    )
    monkeypatch.setattr("finn.ingest.screener.ingest_quarterly", lambda ticker: 0)
    monkeypatch.setattr(
        "finn.pipeline.engine.check_price_volume", lambda ticker, thresholds=None: []
    )

    calls = 0

    async def classify(rows):
        nonlocal calls
        calls += len(rows)
        return [{**row, "category": "press_release", "importance": 3} for row in rows]

    async def enrich(ticker, row):
        return {"summary": "Stable truthful summary."}

    monkeypatch.setattr("finn.pipeline.classifier.classify_batch", classify)
    monkeypatch.setattr("finn.pipeline.enrichers.enrich_generic", enrich)

    first = await run_pipeline(push=False)
    second = await run_pipeline(push=False)

    assert first["new_alerts"] == 1
    assert second["new_alerts"] == 0
    assert second["idempotent_replay"] is True
    assert calls == 1
    matching = [a for a in db.feed(include_read=True) if a["ticker"] == "PIPECO"]
    assert len(matching) == 1


def test_adk_usage_fields_and_explicit_tier_are_recorded():
    recorded = routing.record_usage(
        "research",
        routing.Tier.REASONING,
        SimpleNamespace(prompt_token_count=11, candidates_token_count=7),
    )
    assert recorded == {"prompt_tokens": 11, "completion_tokens": 7}
    summary = db.cost_summary()
    assert summary["by_tier"]["reasoning"] >= 18
    assert any(
        row["tier"] == "reasoning" and row["scope"] == "research"
        for row in summary["by_scope_model"]
    )
