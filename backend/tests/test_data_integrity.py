"""Focused regressions for model-output, fiscal-period, and source integrity."""
from types import SimpleNamespace

import pytest

from finn import config, db
from finn.alerts import enrichers
from finn.ingest import screener, seed_docs
from finn.llm import routing
from finn.tools import filings_rag


def test_sanitize_replaces_persisted_scratch_summaries():
    db.add_alert(
        "SCRATCH",
        "announcement",
        {
            "headline": "Board approves results",
            "summary": "Count words: Board(1) approves(2)",
            "bio": {"name": "A", "role": "CFO", "background": "Count words: 4"},
        },
        1,
    )
    db.save_digest(
        "start",
        "end",
        {"items": [{"ticker": "SCRATCH", "headline": "Board approves results",
                    "one_liner": "Count words: Board(1)"}]},
        source_key="digest:scratch",
    )
    assert enrichers.sanitize_stored_narratives() >= 2
    alert = next(row for row in db.feed(include_read=True) if row["ticker"] == "SCRATCH")
    assert alert["payload"]["summary"] == "Board approves results"
    assert "bio" not in alert["payload"]
    digest = db.latest_digest()
    assert digest["rendered"]["items"][0]["one_liner"] == "Board approves results"


def test_strip_think_filters_scratch_and_meta_output():
    text = (
        "<think>We need to count carefully.</think>\n"
        "Revenue rose 12% year-on-year.\n"
        "Count words: 5"
    )
    assert routing.strip_think(text) == "Revenue rose 12% year-on-year."
    assert routing.strip_think("Thinking: craft a concise answer\nCount words: 6") == ""
    assert routing.strip_think("<think>unfinished private reasoning") == ""
    assert routing.strip_think("<analysis>unfinished private reasoning") == ""


def test_strip_think_extracts_json_without_surrounding_scratch():
    raw = 'Analysis: classify this\n{"results": [{"id": 0, "category": "results"}]}\nCount words: 7'
    assert routing.strip_think(raw) == '{"results": [{"id": 0, "category": "results"}]}'
    assert routing.strip_think('{"background": "Count words: 4"}') == ""


@pytest.mark.asyncio
async def test_chat_never_promotes_reasoning_trace(monkeypatch):
    async def fake_completion(**_kwargs):
        message = SimpleNamespace(
            content="",
            reasoning_content="Count words: 4\nInvented final answer",
        )
        return SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=1, completion_tokens=2),
            choices=[SimpleNamespace(message=message)],
        )

    monkeypatch.setitem(
        __import__("sys").modules,
        "litellm",
        SimpleNamespace(acompletion=fake_completion),
    )
    monkeypatch.setattr(routing, "record_usage", lambda *_args, **_kwargs: {})
    assert await routing.chat(routing.Tier.FAST, [], "test") == ""


@pytest.mark.asyncio
async def test_enricher_uses_computed_fallback_for_meta_output(monkeypatch):
    async def meta_response(*_args, **_kwargs):
        return "Thinking: choose a short sentence\nCount words: 8"

    monkeypatch.setattr(routing, "chat", meta_response)
    facts = {
        "period": "Q2FY26",
        "rows": [
            {"label": "Revenue", "value": 3207, "qoq_pct": 4.1, "yoy_pct": 22.8},
        ],
    }
    summary = await enrichers._one_liner({"headline": "Quarterly results"}, facts)
    assert summary == "Q2FY26: Revenue 3,207; up 4.1% QoQ; up 22.8% YoY"
    assert "count words" not in summary.lower()
    assert "thinking" not in summary.lower()


@pytest.mark.parametrize(
    ("raw", "label", "period_end"),
    [
        ("Jun 2025", "Q1FY26", "2025-06-30"),
        ("Sep 2025", "Q2FY26", "2025-09-30"),
        ("Dec 2025", "Q3FY26", "2025-12-31"),
        ("Mar 2026", "Q4FY26", "2026-03-31"),
    ],
)
def test_indian_fiscal_period_normalisation(raw, label, period_end):
    assert screener._period_label(raw) == label
    assert screener._period_end_iso(raw) == period_end


def test_ingest_normalises_iso_dates_and_sorts(monkeypatch):
    rows = [
        {"period": "Q4FY26", "period_end": "wrong", "revenue": 4},
        {"period": "Q2FY26", "period_end": "2025-Sep-30", "revenue": 2},
        {"period": "Q1FY26", "period_end": "", "revenue": 1},
        {"period": "Q3FY26", "period_end": "2025-Dec-31", "revenue": 3},
    ]
    captured = {}
    monkeypatch.setattr(screener, "scrape_quarterly", lambda _ticker: rows)
    monkeypatch.setattr(
        db,
        "put_quarterly",
        lambda ticker, normalised: captured.update(ticker=ticker, rows=normalised),
    )

    assert screener.ingest_quarterly("TEST") == "live"
    assert [row["period"] for row in captured["rows"]] == [
        "Q1FY26",
        "Q2FY26",
        "Q3FY26",
        "Q4FY26",
    ]
    assert [row["period_end"] for row in captured["rows"]] == [
        "2025-06-30",
        "2025-09-30",
        "2025-12-31",
        "2026-03-31",
    ]


def test_seeded_documents_are_unambiguously_illustrative(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DOCS_DIR", tmp_path)
    legacy = seed_docs.PERSISTENT_TRANSCRIPTS[0]
    db.add_chunk(
        "PERSISTENT",
        legacy["doc_type"],
        legacy["title"],
        legacy["period"],
        "https://example.invalid/claimed-official",
        0,
        "Unlabelled synthetic legacy text",
    )
    seed_docs.seed_all()

    with db.db() as conn:
        rows = conn.execute(
            "SELECT doc_type, doc_title, url, text FROM chunks "
            "WHERE ticker IN ('PERSISTENT', 'CROMPTON', 'IRCTC')"
        ).fetchall()
        legacy_count = conn.execute(
            "SELECT COUNT(*) FROM chunks WHERE ticker='PERSISTENT' AND doc_title=?",
            (legacy["title"],),
        ).fetchone()[0]

    assert rows
    assert legacy_count == 0
    assert all(row["doc_type"] == seed_docs.DEMO_DOC_TYPE for row in rows)
    assert all(row["doc_title"].startswith(seed_docs.DEMO_TITLE_PREFIX) for row in rows)
    assert all(row["url"].startswith("illustrative-demo://") for row in rows)
    assert all(row["text"].startswith(seed_docs.DEMO_NOTICE) for row in rows)

    manifest = __import__("json").loads((tmp_path / "manifest.json").read_text())
    docs = [doc for ticker_docs in manifest.values() for doc in ticker_docs]
    assert all(doc["is_demo"] is True for doc in docs)
    assert all(doc["official_source"] is False for doc in docs)
    assert all(doc["source_status"] == "illustrative_synthetic_not_official" for doc in docs)


def test_research_tool_refuses_illustrative_fixture():
    db.add_chunk(
        "DEMOONLY",
        seed_docs.DEMO_DOC_TYPE,
        f"{seed_docs.DEMO_TITLE_PREFIX} Fake transcript",
        "Q2FY26",
        "illustrative-demo://demoonly/fake",
        0,
        seed_docs.DEMO_NOTICE + "Management claimed revenue growth of 99 percent.",
    )
    result = __import__("json").loads(
        filings_rag.search_docs("DEMOONLY", "revenue growth")
    )
    assert result["status"] == "no_results"
    assert result["sources"] == []
