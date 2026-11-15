"""The server only lets an answer cite sources its tools actually returned."""
from __future__ import annotations

from finn.llm.citations import collect_sources, finalize
from finn.llm.intent import detect_ticker, route


def _registry():
    registry: dict[str, dict] = {}
    collect_sources({
        "status": "ok",
        "sources": [{"source_id": "S12", "doc_title": "Q2 FY26 call", "doc_type": "transcript",
                     "period": "Q2FY26", "url": "https://issuer.example/q2.pdf",
                     "excerpt": "We expect margins of 15 to 16 percent."}],
        "quarters": [{"source_id": "M1", "source_title": "Q2FY26 metrics", "period": "Q2FY26"}],
    }, registry)
    return registry


def test_valid_citations_are_renumbered_and_returned():
    text, cites, rejected = finalize("Margins were guided at 15 to 16% [S12]. Revenue grew [M1].", _registry())
    assert text == "Margins were guided at 15 to 16% [1]. Revenue grew [2]."
    assert [c["id"] for c in cites] == ["S12", "M1"]
    assert cites[0]["url"] == "https://issuer.example/q2.pdf"
    assert rejected == []


def test_made_up_citation_is_dropped():
    text, cites, rejected = finalize("Revenue doubled [S999].", _registry())
    assert "[" not in text
    assert cites == []
    assert rejected == ["S999"]


def test_trailing_sources_block_is_removed():
    raw = "Margins held [S12].\n\nSOURCES:\n[S12] Q2 FY26 call (transcript, Q2FY26)"
    text, cites, _ = finalize(raw, _registry())
    assert "SOURCES" not in text
    assert len(cites) == 1


def test_company_questions_route_to_the_research_analyst():
    assert detect_ticker("What did Persistent guide on margins?") == "PERSISTENT"
    assert route("How did infosys do?", None, None) == ("research", "INFY")
    assert route("What changed in my portfolio today?", None, None) == ("assistant", None)
    assert route("and margins?", None, "CROMPTON") == ("research", "CROMPTON")
    assert route("how is my portfolio doing", None, "CROMPTON") == ("assistant", None)


def test_lowercase_short_words_are_not_tickers():
    assert detect_ticker("is it on track") is None


def test_unseen_listed_companies_route_by_symbol_or_name():
    for message, symbol in [
        ("What did DIXON guide for FY26?", "DIXON"),
        ("What did Dixon Technologies guide for FY26?", "DIXON"),
        ("what did dixon guide for fy26", "DIXON"),
        ("How is Bajaj Auto doing?", "BAJAJ-AUTO"),
        ("What did Larsen & Toubro say about orders?", "LT"),
        ("Hindustan Unilever volume growth?", "HINDUNILVR"),
        ("What did M&M say on EV capex?", "M&M"),
    ]:
        assert route(message, None, None) == ("research", symbol), message


def test_generic_and_off_topic_questions_stay_with_the_assistant():
    for message in ["What is the capital of France?", "Explain EBITDA margin", "Is the total risk high?",
                    "WHAT IS THE GUIDANCE", "Write me a poem about rain", "Is IT sector weak?"]:
        assert route(message, None, None) == ("assistant", None), message
