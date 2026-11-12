"""Tests for the digest composer and DB layer."""
from finn import db
from finn.alerts.digest import compose_digest


def test_digest_ranks_and_collapses():
    enriched = [
        {"ticker": "A", "category": "unclassified", "headline": "routine paperwork",
         "priority": 4, "filed_at": "2026-11-11T10:00:00+00:00"},
        {"ticker": "B", "category": "results", "headline": "Q2 results approved",
         "priority": 1, "filed_at": "2026-11-11T09:00:00+00:00", "summary": "Revenue up 22.8% YoY"},
        {"ticker": "C", "category": "dividend", "headline": "Interim dividend Rs 11",
         "priority": 3, "filed_at": "2026-11-11T08:00:00+00:00", "summary": "Record date Nov 18"},
    ]
    threshold_alerts = [
        {"ticker": "D", "kind": "volume_spike", "priority": 2,
         "payload": {"value": 3.2, "threshold": 2.5, "close": 1234, "change_pct": 1.2}},
    ]
    digest = compose_digest(enriched, threshold_alerts, hours=24)
    assert digest["title"] == "Your 24h brief"
    # results first
    assert digest["items"][0]["ticker"] == "B"
    assert digest["items"][1]["ticker"] == "D"
    # routine buried into stats, not shown
    assert digest["stats"]["hidden"] == 1
    assert digest["stats"]["held_back"] == 0
    assert digest["stats"]["shown"] + digest["stats"]["hidden"] + digest["stats"]["held_back"] == digest["stats"]["total"]
    assert all(i["ticker"] != "A" for i in digest["items"])


def test_digest_counts_items_held_back_by_the_brief_cap():
    enriched = [
        {"ticker": f"T{i}", "category": "results", "headline": f"Results {i}",
         "priority": 1, "filed_at": f"2026-11-11T{i % 10:02d}:00:00+00:00", "summary": "Revenue up"}
        for i in range(13)
    ]
    digest = compose_digest(enriched, [], hours=24)
    assert digest["stats"]["shown"] == 12
    assert digest["stats"]["hidden"] == 0
    assert digest["stats"]["held_back"] == 1
    assert len(digest["items"]) == 12


def test_fts_search_roundtrip():
    db.ensure_fts()
    db.add_chunk("TST", "transcript", "Q2 FY26 Concall", "Q2FY26", "http://x", 0,
                 "We expect mid-teens revenue growth for the full year with margin expansion.")
    db.add_chunk("TST", "annual_report", "FY25 Annual Report", "FY25", "http://y", 5,
                 "The company operates in two segments: fans and lighting.")
    hits = db.search_chunks("TST", "margin expansion")
    assert len(hits) >= 1
    assert "guidance" in hits[0]["text"] or "margin" in hits[0]["text"]
    assert hits[0]["doc_type"] == "transcript"


def test_cost_ledger_and_summary():
    db.log_cost("classifier", "hyde/glm-5.3-flash", 100, 50)
    db.log_cost("research", "hyde/glm-5.3-flash", 200, 100)
    s = db.cost_summary()
    assert s["total_tokens"] >= 450
    # tier split now follows pipeline scope: classifier/enrichment = fast, research = reasoning
    assert s["by_tier"].get("fast", 0) >= 150
    assert s["by_tier"].get("reasoning", 0) >= 300


def test_settings_roundtrip():
    db.set_json_setting("thresholds", {"volume_multiplier": 3.0})
    assert db.get_json_setting("thresholds")["volume_multiplier"] == 3.0
    db.set_json_setting("thresholds", {})
