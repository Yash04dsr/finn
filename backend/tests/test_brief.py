"""The brief splits material items from background, records verdicts, and learns from mutes."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from finn import brief, db
from finn.alerts import engine


def _alert(ticker, category, priority, headline, key):
    when = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    return db.add_alert(ticker, "announcement",
                        {"category": category, "headline": headline, "filed_at": when},
                        priority, source_key=key)


def test_brief_splits_material_background_and_routine():
    _alert("BRF", "results", 1, "Q2 results approved", "brief:1")
    _alert("BRF", "dividend", 3, "Interim dividend declared", "brief:2")
    _alert("BRF", "unclassified", 4, "Allotment of ESOP shares", "brief:3")
    _alert("BRF", "capex", 2, "Board approves capex of Rs 300 crore", "brief:4")
    b = brief.brief(24)
    tickers = lambda rows: [r for r in rows if r["ticker"] == "BRF"]
    assert len(tickers(b["material"])) == 1
    assert len(tickers(b["worth_a_look"])) == 1
    assert len(tickers(b["background"])) == 1
    assert b["routine_count"] >= 1
    assert tickers(b["material"])[0]["touches"] == "Delivery against guidance"


def test_verdict_clears_item_and_is_remembered():
    alert_id = _alert("VRD", "management_change", 1, "CFO resigns", "brief:v1")
    brief.set_verdict(alert_id, "no_impact")
    b = brief.brief(24)
    assert not [r for r in b["material"] if r["id"] == alert_id]
    assert [r for r in b["done"] if r["id"] == alert_id][0]["verdict"] == "no_impact"
    second = _alert("VRD", "management_change", 1, "CS resigns", "brief:v2")
    item = [r for r in brief.brief(24)["material"] if r["id"] == second][0]
    assert item["past_verdict"]["verdict"] == "no_impact"


def test_muting_a_category_lowers_its_rank():
    engine.set_thresholds({"categories_watch": ["results", "capex"]})
    alert_id = _alert("MUT", "capex", 2, "Board approves capex of Rs 300 crore", "brief:m1")
    result = brief.set_verdict(alert_id, "no_impact", mute_category=True)
    assert result["muted_category"] == "capex"
    assert "capex" not in engine.get_thresholds()["categories_watch"]


def test_watchpoints_are_drafted_from_checkable_promises():
    ledger = {"rows": [
        {"period": "Q2FY27", "kind": "ebit_margin", "band": "16 to 17%", "promise_source": {"source_id": "S5"}},
        {"period": "Q1FY27", "kind": "ebit_margin", "band": "15%", "promise_source": None},
        {"period": "Q1FY27", "kind": "other", "band": "50 billion", "promise_source": None},
    ]}
    drafted = brief.draft_from_ledger("WPT", ledger)
    assert len(drafted) == 1
    assert drafted[0]["text"].startswith("EBIT margin 16 to 17%")
    assert (drafted[0]["lo"], drafted[0]["hi"]) == (16.0, 17.0)
    assert brief.draft_from_ledger("WPT", ledger)[0]["id"] == drafted[0]["id"]


def test_backfill_fills_bounds_from_band_text():
    wp = brief.add_watchpoint("BKF", "EBITDA margin 15 to 16%, as guided on the Q4FY25 call",
                              "ebitda_margin", None, None, None, "drafted")
    brief.backfill_bounds()
    row = [w for w in brief.watchpoints("BKF") if w["id"] == wp["id"]][0]
    assert (row["lo"], row["hi"]) == (15.0, 16.0)


def _results(ticker, revenue=1000.0, ebitda=142.0, yoy=12.0, sample=False):
    return {"id": 0, "ticker": ticker, "kind": "announcement", "payload": {
        "category": "results", "headline": f"{ticker} Q2 FY26 results", "is_sample": sample,
        "filing_url": f"https://example.com/{ticker}.pdf",
        "facts": {"period": "Q2FY26", "rows": [
            {"label": "Revenue", "value": revenue, "yoy_pct": yoy},
            {"label": "EBITDA", "value": ebitda, "yoy_pct": None},
        ]}}}


def _guide(ticker, lo, hi):
    chunk = db.add_chunk(ticker, "transcript", f"{ticker} Q4 FY25 call", "Q4FY25",
                         f"https://example.com/{ticker}-q4.pdf", 0, "We expect EBITDA margin of 15 to 16% next year.")
    return brief.add_watchpoint(ticker, f"EBITDA margin {lo:g} to {hi:g}%, as guided on the Q4FY25 call",
                                "ebitda_margin", lo, hi, chunk, "drafted"), chunk


def test_promise_check_missed_cites_both_sides():
    _, chunk = _guide("PCM", 15.0, 16.0)
    check = brief.promise_check(_results("PCM"), brief.watchpoints("PCM"))
    assert check["status"] == "missed"
    assert check["metric"] == "EBITDA margin" and check["delivered"] == 14.2
    assert check["guided_band"] == "15-16%" and check["guided_period"] == "Q4 FY25"
    assert check["guided_source"]["source_id"] == f"S{chunk}"
    assert check["delivered_source"]["url"] == "https://example.com/PCM.pdf"
    assert check["note"] == "EBITDA margin 14.2% in Q2 FY26 against 15-16% guided on the Q4 FY25 call."
    assert check["is_illustrative"] is False


def test_promise_check_kept_and_sample_is_labelled():
    _guide("PCK", 13.0, 14.0)
    check = brief.promise_check(_results("PCK", sample=True), brief.watchpoints("PCK"))
    assert check["status"] == "kept"
    assert check["is_illustrative"] is True
    assert check["note"].startswith("Illustrative sample:")


def test_promise_check_ignores_guidance_from_the_same_call():
    brief.add_watchpoint("PCS", "EBITDA margin 15 to 16%, as guided on the Q2FY26 call",
                         "ebitda_margin", 15.0, 16.0, None, "drafted")
    check = brief.promise_check(_results("PCS"), brief.watchpoints("PCS"))
    assert check["status"] == "no_guidance"
    assert check["guided_lo"] is None and check["guided_source"] is None
    assert check["metric"] == "Revenue growth" and check["delivered"] == 12.0


def test_promise_check_without_guidance_or_numbers():
    alert = _results("PCN")
    alert["payload"].pop("facts")
    check = brief.promise_check(alert, [])
    assert check["status"] == "no_guidance" and check["delivered"] is None


def test_promise_check_not_reported_when_filing_lacks_the_metric():
    _guide("PCR", 15.0, 16.0)
    alert = _results("PCR", ebitda=None)
    check = brief.promise_check(alert, brief.watchpoints("PCR"))
    assert check["status"] == "not_reported" and check["delivered"] is None


def test_promise_check_is_none_for_other_alerts():
    alert = {"id": 0, "ticker": "PCO", "kind": "announcement", "payload": {"category": "dividend"}}
    assert brief.promise_check(alert, []) is None
    assert brief.promise_check({"id": 0, "ticker": "PCO", "kind": "price_move", "payload": {}}, []) is None


def test_brief_items_carry_promise_check():
    _alert("BRF2", "results", 1, "Q2 results approved", "brief:pc1")
    _alert("BRF2", "capex", 2, "Board approves capex", "brief:pc2")
    b = brief.brief(24)
    items = [r for r in b["material"] + b["worth_a_look"] if r["ticker"] == "BRF2"]
    assert {r["payload"]["category"]: r["promise_check"] is None for r in items} == {"results": False, "capex": True}
