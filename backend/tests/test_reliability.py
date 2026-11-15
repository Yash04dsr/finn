"""Regression tests for public-demo reliability and repeat-run idempotency."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from finn import db
from finn.api.main import _parse_db_time
from finn.ingest.nse_feed import _parse_nse_time, _redate, fetch_announcements
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
async def test_sample_day_rerun_refreshes_instead_of_duplicating(monkeypatch):
    times = iter([
        datetime.now(timezone.utc) - timedelta(hours=30),
        datetime.now(timezone.utc) - timedelta(hours=2),
    ])

    def fetch(snapshot_anchor=None, sample=False, tickers=None):
        filed_at = next(times).isoformat()
        return ([{
            "ticker": "PIPECO",
            "category": "press_release",
            "headline": "Stable demo announcement",
            "body": "",
            "filed_at": filed_at,
            "source": "sample",
        }], "sample")

    monkeypatch.setattr("finn.pipeline.nse_feed.fetch_announcements", fetch)
    monkeypatch.setattr("finn.pipeline.portfolio_tools.watched_tickers", lambda: ["PIPECO"])
    monkeypatch.setattr("finn.pipeline.portfolio_tools.research_tickers", lambda: ["PIPECO"])
    monkeypatch.setattr(
        "finn.pipeline.prices_ingest.refresh_all_prices", lambda days=60, tickers=None: {}
    )
    monkeypatch.setattr("finn.pipeline._ingest_fundamentals", lambda tickers: None)
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

    first = await run_pipeline(push=False, sample=True)
    second = await run_pipeline(push=False, sample=True)

    assert first["new_alerts"] == 1
    assert second["new_alerts"] == 0
    assert calls == 1
    matching = [a for a in db.feed(include_read=True) if a["ticker"] == "PIPECO"]
    assert len(matching) == 1
    assert matching[0]["payload"]["is_sample"] is True
    recent = [a for a in db.feed(since_hours=24, include_read=True) if a["ticker"] == "PIPECO"]
    assert len(recent) == 1, "the rerun moved the sample filing into the current window"


def test_sample_results_name_the_quarter_their_numbers_come_from():
    from finn.ingest.nse_feed import fill_sample
    from finn.tools.metrics import first_cut

    db.put_quarterly("SMPCO", [
        {"period": "Q1FY27", "period_end": "2026-06-30", "revenue": 100.0, "ebitda": 20.0},
        {"period": "Q2FY27", "period_end": "2026-09-30", "revenue": 110.0, "ebitda": 21.0},
    ])
    row = fill_sample([{"ticker": "SMPCO", "headline": "SMPCO {quarter} results",
                        "body": "Quarter ended {quarter_end}; next is {next_quarter}."}],
                      datetime(2026, 11, 15, tzinfo=timezone.utc))[0]
    assert row["headline"] == "SMPCO Q2 FY27 results"
    assert row["body"] == "Quarter ended September 30, 2026; next is Q3 FY27."
    assert first_cut("SMPCO")["period"] == "Q2FY27"


def test_sample_quarter_falls_back_to_the_last_completed_quarter():
    from finn.ingest.nse_feed import sample_fields

    assert sample_fields("NODATA", datetime(2026, 11, 15, tzinfo=timezone.utc))["quarter"] == "Q2 FY27"
    jan = sample_fields("NODATA", datetime(2027, 1, 10, tzinfo=timezone.utc))
    assert (jan["quarter"], jan["quarter_end"]) == ("Q3 FY27", "December 31, 2026")
    apr = sample_fields("NODATA", datetime(2027, 4, 20, tzinfo=timezone.utc))
    assert (apr["quarter"], apr["quarter_end"], apr["next_quarter"]) == ("Q4 FY27", "March 31, 2027", "Q1 FY28")


def test_sample_day_has_no_fixed_quarters_or_invented_results_numbers():
    from finn.ingest.nse_feed import load_snapshot

    rows = load_snapshot()
    assert rows and not [r for r in rows if "2025" in r["headline"] + r["body"]]
    for r in (r for r in rows if r["category"] == "results"):
        assert re.search(r"\{(next_)?quarter(_end)?\}", r["headline"] + r["body"])
        assert "crore" not in r["body"].lower(), "results numbers must come from the stored quarter"


def test_rewording_the_sample_day_drops_the_old_sample_alerts():
    from finn.pipeline import _drop_stale_sample

    when = datetime.now(timezone.utc).isoformat()
    db.upsert_filing("STALE", "results", "STALE Q2 FY26 results", "", when, source="sample", is_demo=True)
    old = db.add_alert("STALE", "announcement", {"headline": "STALE Q2 FY26 results", "is_sample": True,
                                                 "filed_at": when}, 1, source_key="stale:old")
    new = db.add_alert("STALE", "announcement", {"headline": "STALE Q2 FY27 results", "is_sample": True,
                                                 "filed_at": when}, 1, source_key="stale:new")
    _drop_stale_sample([{"ticker": "STALE", "headline": "STALE Q2 FY27 results"}])
    assert db.get_alert(old) is None and db.get_alert(new) is not None


def test_nse_times_are_read_as_india_time():
    assert _parse_nse_time("11-Nov-2026 18:05:00") == "2026-11-11T12:35:00+00:00"


def test_quiet_live_day_is_not_an_outage(monkeypatch):
    monkeypatch.setattr("finn.ingest.nse_feed.fetch_live_announcements", lambda tickers=None: [])
    rows, mode = fetch_announcements()
    assert rows == [] and mode == "live"
    monkeypatch.setattr("finn.ingest.nse_feed.fetch_live_announcements", lambda tickers=None: None)
    rows, mode = fetch_announcements()
    assert rows == [] and mode == "unavailable"


def test_feed_window_uses_event_time_not_insert_time():
    old = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    db.add_alert("WINCO", "announcement", {"headline": "Old filing", "filed_at": old}, 2,
                 source_key="window:old")
    assert not [a for a in db.feed(since_hours=24, include_read=True) if a["ticker"] == "WINCO"]
    assert [a for a in db.feed(since_hours=24 * 7, include_read=True) if a["ticker"] == "WINCO"]


def test_clean_sentence_gate_rejects_fragments_and_counters():
    from finn.alerts.enrichers import is_clean_sentence, public_line

    assert not is_clean_sentence('"Grav')
    assert not is_clean_sentence("Count: Neuland(1) results beat 16 words")
    assert is_clean_sentence("Persistent Q2 revenue rose 22.8% year on year.")
    assert public_line('"Grav', "Gravita board approves capex") == "Gravita board approves capex"


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
