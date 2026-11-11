"""Tests for the deterministic Guidance Scorecard (promises vs delivery)."""
import pytest

from finn import db
from finn.tools import guidance


@pytest.fixture
def persistent_like_corpora():
    """Seed a PERSISTENT-shaped corpus: transcripts with guidance + quarterly series."""
    db.put_quarterly("TESTGUID", [
        {"period": "Q2FY25", "period_end": "2024-09-30", "revenue": 2611, "ebitda": 460, "pbt": 380, "pat": 303},
        {"period": "Q3FY25", "period_end": "2024-12-31", "revenue": 2775, "ebitda": 496, "pbt": 412, "pat": 330},
        {"period": "Q4FY25", "period_end": "2025-03-31", "revenue": 2941, "ebitda": 531, "pbt": 444, "pat": 357},
        {"period": "Q1FY26", "period_end": "2025-06-30", "revenue": 3080, "ebitda": 567, "pbt": 474, "pat": 382},
        {"period": "Q2FY26", "period_end": "2025-09-30", "revenue": 3207, "ebitda": 616, "pbt": 508, "pat": 410},
    ])
    db.add_chunk("TESTGUID", "transcript", "Q4 FY25 Concall", "Q4FY25", "http://x", 0,
                 "For FY26, we guide to revenue growth of 18 to 22 percent in rupee terms "
                 "and EBITDA margins of 18 to 19 percent.")
    db.add_chunk("TESTGUID", "transcript", "Q2 FY26 Concall", "Q2FY26", "http://x", 1,
                 "We reiterate full-year revenue growth guidance of 18 to 22 percent in rupee "
                 "terms and exit EBITDA margin of 19 percent.")
    yield


def test_range_growth_extraction():
    t = "For FY26, we guide to revenue growth of 18 to 22 percent in rupee terms."
    lo, hi, quote = guidance._parse_claim("revenue_growth", t)
    assert (lo, hi) == (18.0, 22.0)
    assert "18 to 22" in quote


def test_growth_guidance_wording():
    t = "We reiterate full-year revenue growth guidance of 18 to 22 percent in rupee terms."
    lo, hi, _ = guidance._parse_claim("revenue_growth", t)
    assert (lo, hi) == (18.0, 22.0)


def test_low_twenties_maps_to_band():
    t = "we continue to target revenue growth in the low twenties percentage band in rupee terms"
    lo, hi, quote = guidance._parse_claim("revenue_growth", t)
    assert (lo, hi) == (20.0, 23.0)
    assert "low twenties" in quote


def test_exit_margin_direct_wording():
    t = "We reiterate full-year revenue growth guidance of 18 to 22 percent in rupee terms and exit EBITDA margin of 19 percent."
    lo, hi, quote = guidance._parse_claim("ebitda_exit_margin", t)
    assert (lo, hi) == (19.0, 19.0)


def test_exit_margin_pre_wording():
    t = "We expect to exit the year at about 19 percent EBITDA margin."
    lo, hi, _ = guidance._parse_claim("ebitda_exit_margin", t)
    assert lo == 19.0


def test_band_margin_with_qualifier():
    t = ("Sustainable EBITDA margin for the consumer electricals business remains in the "
         "12 to 13 percent band; we guide FY26 at the upper end of this range.")
    lo, hi, _ = guidance._parse_claim("ebitda_margin", t)
    assert (lo, hi) == (12.0, 13.0)


def test_range_margin_plain():
    t = "For FY26, we guide to revenue growth of 18 to 22 percent in rupee terms and EBITDA margins of 18 to 19 percent."
    lo, hi, _ = guidance._parse_claim("ebitda_margin", t)
    assert (lo, hi) == (18.0, 19.0)


def test_grading_verdicts():
    ahead = guidance._grade("k", 18, 22, 22.8)
    assert ahead["verdict"] == "ahead" and ahead["gap"] == 0.8
    on_track = guidance._grade("k", 18, 22, 20.0)
    assert on_track["verdict"] == "on_track"
    behind = guidance._grade("k", 18, 22, 15.0)
    assert behind["verdict"] == "behind" and behind["gap"] == -3.0
    pending = guidance._grade("k", 18, 22, None)
    assert pending["verdict"] == "pending"


def test_grade_without_claimed_band():
    unverifiable = guidance._grade("k", None, None, 20.0)
    assert unverifiable["verdict"] == "unverifiable"


def test_scorecard_end_to_end(persistent_like_corpora):
    """Seeded corpus: both guidance types extracted, graded against delivery."""
    d = guidance.scorecard("TESTGUID")
    assert d["delivered_period"] == "Q2FY26"
    kinds = {c["kind"] for c in d["claims"]}
    assert "revenue_growth" in kinds and "ebitda_exit_margin" in kinds
    for c in d["claims"]:
        assert c["verdict"] == "ahead"
        assert c["source"]["doc_title"]  # citation present
    assert d["streak"]["behind"] == 0
    assert d["credibility"] == "Strong"


def test_scorecard_behind_verdict(persistent_like_corpora):
    """A company delivering below its claimed band grades 'behind'."""
    db.put_quarterly("TESTMISS", [
        {"period": "Q2FY25", "period_end": "2024-09-30", "revenue": 2000, "ebitda": 200, "pbt": 100, "pat": 80},
        {"period": "Q2FY26", "period_end": "2025-09-30", "revenue": 2100, "ebitda": 210, "pbt": 105, "pat": 84},
    ])
    db.add_chunk("TESTMISS", "transcript", "Q2 FY26 Concall", "Q2FY26", "http://x", 0,
                 "We reiterate full-year revenue growth guidance of 18 to 22 percent in rupee terms.")
    d = guidance.scorecard("TESTMISS")
    growth = [c for c in d["claims"] if c["kind"] == "revenue_growth"]
    assert growth and growth[0]["verdict"] == "behind"
    assert growth[0]["gap"] == -13.0  # 5% delivered vs 18% floor
    assert d["credibility"] == "Watch"  # single miss so far


def test_scorecard_band_margin_on_track():
    """Band phrasing ('remains in the 12 to 13 percent band') grades within-band delivery."""
    db.put_quarterly("TESTBAND", [
        {"period": "Q2FY25", "period_end": "2024-09-30", "revenue": 1930, "ebitda": 221, "pbt": 150, "pat": 121},
        {"period": "Q2FY26", "period_end": "2025-09-30", "revenue": 2112, "ebitda": 258, "pbt": 180, "pat": 168},
    ])
    db.add_chunk("TESTBAND", "transcript", "Q2 FY26 Concall", "Q2FY26", "http://x", 0,
                 "Sustainable EBITDA margin for the consumer electricals business remains in the "
                 "12 to 13 percent band; we guide FY26 at the upper end of this range.")
    d = guidance.scorecard("TESTBAND")
    margins = [c for c in d["claims"] if c["kind"] == "ebitda_margin"]
    assert margins, "band-margin claim should be extracted"
    assert margins[0]["verdict"] == "on_track"
    assert margins[0]["claimed"]["lo"] == 12.0 and margins[0]["claimed"]["hi"] == 13.0
    assert margins[0]["delivered"] == 12.2


def test_scorecard_empty_ticker_is_safe():
    d = guidance.scorecard("SUZLON")  # no docs, no quarterly numbers
    assert d["claims"] == []
    assert d["credibility"] in ("Watch", "Challenged", "Strong")
