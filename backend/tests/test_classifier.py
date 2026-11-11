"""Tests for the hybrid classifier: keywords must nail the clear cases at zero cost."""
from finn.alerts.classifier import keyword_classify, classify_batch, CATEGORIES


def test_results_keywords():
    cat, conf = keyword_classify(
        "Outcome of Board Meeting - approved financial results for the quarter ended September 30, 2025")
    assert cat == "results"
    assert conf >= 0.6


def test_management_change():
    cat, conf = keyword_classify(
        "Resignation of Chief Financial Officer - Mr. X steps down")
    assert cat == "management_change"


def test_buyback_is_fund_raise():
    cat, conf = keyword_classify(
        "Board approves buyback of equity shares for an amount not exceeding Rs 9,300 crore")
    assert cat == "fund_raise"


def test_credit_rating():
    cat, _ = keyword_classify("CRISIL reaffirms credit rating at AAA/Stable for long-term facilities")
    assert cat == "credit_rating"


def test_usfda_is_litigation():
    cat, _ = keyword_classify(
        "USFDA classification for Gagillapur facility; 4 observations issued")
    assert cat == "litigation"


def test_routine_prefix_buried():
    cat, conf = keyword_classify("Shareholding pattern for the quarter ended September 30, 2025")
    assert cat == "unclassified"
    assert conf >= 0.9


def test_ambiguous_goes_to_llm():
    assert keyword_classify("Company updates on business operations") is None


def test_all_categories_valid():
    assert len(CATEGORIES) == 17
    assert len(set(CATEGORIES)) == 17


def test_classify_batch_keyword_path():
    items = [{"headline": "Board approves acquisition of 51% stake in subsidiary",
              "body": ""}]
    import asyncio
    out = asyncio.run(classify_batch(items))
    assert out[0]["category"] == "M&A"
    assert out[0]["how"] == "keywords"
