"""Tests for deterministic financial math — the numbers must be exactly right."""
import pytest

from finn import db
from finn.tools.metrics import first_cut, margins_for, growth_summary


@pytest.fixture
def quarterly_data():
    rows = [
        {"period": "Q2FY25", "period_end": "2024-09-30", "revenue": 2611, "ebitda": 460, "pbt": 380, "pat": 303},
        {"period": "Q3FY25", "period_end": "2024-12-31", "revenue": 2775, "ebitda": 496, "pbt": 412, "pat": 330},
        {"period": "Q4FY25", "period_end": "2025-03-31", "revenue": 2941, "ebitda": 531, "pbt": 444, "pat": 357},
        {"period": "Q1FY26", "period_end": "2025-06-30", "revenue": 3080, "ebitda": 567, "pbt": 474, "pat": 382},
        {"period": "Q2FY26", "period_end": "2025-09-30", "revenue": 3207, "ebitda": 616, "pbt": 508, "pat": 410},
    ]
    db.put_quarterly("TESTCO", rows)
    return rows


def test_first_cut_qoq(quarterly_data):
    cut = first_cut("TESTCO")
    assert cut is not None
    assert cut["period"] == "Q2FY26"
    assert cut["prev_period"] == "Q1FY26"
    rev = cut["metrics"]["revenue"]
    assert rev["value"] == 3207
    # (3207-3080)/3080 = 4.12% -> 4.1
    assert rev["qoq_pct"] == 4.1


def test_first_cut_yoy(quarterly_data):
    cut = first_cut("TESTCO")
    rev = cut["metrics"]["revenue"]
    # YoY vs Q2FY25: (3207-2611)/2611 = 22.83% -> 22.8
    assert rev["yoy_pct"] == 22.8
    assert cut["yoy_period"] == "Q2FY25"


def test_margins(quarterly_data):
    m = margins_for("TESTCO")
    latest = m[-1]
    assert latest["period"] == "Q2FY26"
    # 616/3207 = 19.2%
    assert latest["ebitda_pct"] == 19.2
    # 410/3207 = 12.78% -> 12.8
    assert latest["pat_pct"] == 12.8


def test_growth_summary(quarterly_data):
    g = growth_summary("TESTCO")
    assert len(g["rev_qoq"]) == 4
    assert g["rev_qoq"][0]["qoq_pct"] == 6.3  # 2775 vs 2611


def test_first_cut_insufficient_data():
    db.put_quarterly("EMPTYCO", [{"period": "Q1FY26", "period_end": "2025-06-30",
                                  "revenue": 100, "ebitda": 10, "pbt": 8, "pat": 6}])
    assert first_cut("EMPTYCO") is None
