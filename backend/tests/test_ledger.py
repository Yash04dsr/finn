"""The Promise ledger grades management's words against reported numbers in code."""
from __future__ import annotations

from finn.tools.ledger import company_level, grade, period_key, summarize

SERIES = [
    {"period": "Q2FY26", "revenue": 1000.0, "ebitda": 190.0, "depreciation": 30.0, "pat": 100.0},
    {"period": "Q3FY26", "revenue": 1050.0, "ebitda": 200.0, "depreciation": 30.0, "pat": 105.0},
    {"period": "Q4FY26", "revenue": 1100.0, "ebitda": 205.0, "depreciation": 31.0, "pat": 110.0},
    {"period": "Q1FY27", "revenue": 1120.0, "ebitda": 180.0, "depreciation": 32.0, "pat": 100.0},
    {"period": "Q2FY27", "revenue": 1150.0, "ebitda": 150.0, "depreciation": 40.0, "pat": 90.0},
]


def claim(period, kind, lo, hi=None, unit="%", metric=None):
    return {"period": period, "kind": kind, "metric": metric or kind, "lo": lo, "hi": hi if hi is not None else lo,
            "unit": unit, "horizon": "FY27", "quote": "we expect margins to be in the range", "speaker": "CFO",
            "chunk_id": None}


def test_missed_margin_promise_is_graded_against_latest_quarter():
    rows = grade([claim("Q4FY26", "ebitda_margin", 18, 19)], SERIES, ["Q4FY26"])
    assert rows[0]["status"] == "missed"
    assert rows[0]["delivered"] == 13.0
    assert rows[0]["delivered_period"] == "Q2FY27"


def test_kept_growth_promise():
    rows = grade([claim("Q1FY27", "revenue_growth", 10, 20)], SERIES, ["Q1FY27"])
    assert rows[0]["status"] == "kept"
    assert rows[0]["delivered"] == 15.0


def test_changed_band_on_a_later_call_is_revised():
    rows = grade([claim("Q3FY26", "ebit_margin", 16, 17), claim("Q1FY27", "ebit_margin", 13, 14)],
                 SERIES, ["Q3FY26", "Q1FY27"])
    older = next(r for r in rows if r["period"] == "Q3FY26")
    assert older["status"] == "revised"
    assert "Q1FY27" in older["note"]


def test_promise_not_repeated_on_later_calls_goes_quiet():
    rows = grade([claim("Q3FY26", "revenue_growth", 20, 25, unit="bps")], SERIES, ["Q3FY26", "Q4FY26", "Q1FY27"])
    assert rows[0]["status"] == "gone_quiet"


def test_promise_for_the_current_quarter_is_too_early():
    rows = grade([claim("Q2FY27", "ebitda_margin", 15)], SERIES, ["Q2FY27"])
    assert rows[0]["status"] == "too_early"


def test_segment_guidance_is_not_graded_against_company_numbers():
    india = claim("Q4FY26", "revenue_growth", 25, metric="growth in India business")
    defence = claim("Q1FY27", "ebitda_margin", 20, 25, metric="defense business margins")
    company = claim("Q1FY27", "revenue_growth", 10, 20, metric="consolidated revenue growth")
    rows = grade([india, defence, company], SERIES, ["Q4FY26", "Q1FY27"])
    by_metric = {r["metric"]: r for r in rows}
    for segment in ("growth in India business", "defense business margins"):
        assert by_metric[segment]["status"] == "not_checkable"
        assert by_metric[segment]["company_level"] is False and by_metric[segment]["delivered"] is None
    assert by_metric["consolidated revenue growth"]["status"] == "kept"


def test_long_term_target_is_not_held_to_one_quarter():
    target = claim("Q4FY26", "ebitda_margin", 25)
    target["quote"] = "our long-term margin aspiration is 25 percent"
    rows = grade([target], SERIES, ["Q4FY26"])
    assert rows[0]["status"] == "too_early" and rows[0]["delivered"] is None
    assert rows[0]["term"] == "long"


def test_company_level_wording():
    assert company_level("revenue growth", "we expect our business to grow 20% this year")
    assert company_level("EBITDA margin", "Our aspiration continues to be in the 16 to 17% range.")
    assert not company_level("growth in India business", "close to 25% growth in our India business")
    assert not company_level("export revenue", "exports should grow 15%")


def test_summary_and_period_order():
    assert period_key("Q1FY27") > period_key("Q4FY26")
    assert summarize({"kept": 1, "missed": 2, "gone_quiet": 1}).startswith("Missed 2 of 3")
    assert summarize({"kept": 2, "missed": 1}).startswith("Kept 2 of 3")
    assert summarize({"missed": 1}) == "Missed 1 of 1 promise that can be checked against reported numbers."
