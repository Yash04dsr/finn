"""ResearchAnalyst — the grounded Pull-side analyst (REASONING tier).

Contract with the model:
- ONLY use tool outputs (documents, metrics) as factual ground. If the corpus doesn't
  cover it, say so explicitly. No outside company knowledge, no broker commentary.
- Every factual claim carries a [S#] citation matching the sources returned by tools.
- Numbers shown must come from the metrics tool, not memory or mental math.
"""
from __future__ import annotations

import json
from typing import Any

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool

from ..config import MODEL_REASONING
from ..llm import routing
from ..tools import filings_rag, guidance, metrics, prices

INSTRUCTION = """You are FINN's Research Analyst: a rigorous, primary-source-only equity analyst.

## Grounding rules (non-negotiable)
1. Use ONLY the tool results in this conversation as factual ground about companies.
2. If the documents don't cover a question, say: "This isn't covered in the available primary sources (annual reports, transcripts, results filings)." Then stop. Never fill gaps from memory.
3. Every factual claim must end with a citation like [S3] matching a source_id from your tool calls.
4. All numbers must come from the metrics tool. Never compute in your head; call the tool.
5. You are talking to an investor: be concise, dense, and direct. Lead with the answer.

## Style
- Short paragraphs and tight bullets. Bold key numbers.
- If management commentary and delivered numbers diverge, SAY SO plainly - that's your most valuable output.
- End every answer with a line 'SOURCES:' followed by the sources you cited, one per line:
  [S1] doc_title (doc_type, period)

## Workflow for a company question
1. Call doc_overview(ticker) to see what primary sources exist.
2. Pull targeted passages with search_docs (2-4 calls max, vary the phrasing).
3. Call quarterly_metrics(ticker) for the numbers.
4. For guidance/accountability questions ("are they delivering?", "did they keep their word?"), call guidance_scorecard(ticker): it deterministically extracts management's committed numbers from transcripts and grades them against delivered results. Quote the claimed band vs delivered number and cite the claim's source.
5. Synthesise: answer the question directly, cite as you go, flag what's missing."""


def _fmt_crore(v) -> str:
    if v is None:
        return "n/a"
    if abs(v) >= 100000:
        return f"₹{v/100000:.2f} lakh Cr"
    return f"₹{v:,.0f} Cr"


def quarterly_metrics(ticker: str) -> dict[str, Any]:
    """Expose stored quarterly series + computed deltas as a tool result."""
    from .. import db

    series = db.quarterly_series(ticker, limit=8)
    if not series:
        return {"status": "no_data",
                "note": f"No quarterly numbers stored for {ticker}. Tell the user."}
    rows = []
    for r in series:
        rows.append({
            "period": r["period"],
            "revenue_cr": r.get("revenue"),
            "ebitda_cr": r.get("ebitda"),
            "pbt_cr": r.get("pbt"),
            "pat_cr": r.get("pat"),
            "ebitda_margin_pct": (round(r["ebitda"] / r["revenue"] * 100, 1)
                                  if r.get("revenue") and r.get("ebitda") else None),
            "pat_margin_pct": (round(r["pat"] / r["revenue"] * 100, 1)
                               if r.get("revenue") and r.get("pat") else None),
        })
    # deltas for latest vs prior and vs year-ago
    deltas = {}
    if len(rows) >= 2:
        deltas["qoq"] = _delta(rows[-1], rows[-2])
    if len(rows) >= 5:
        year_ago = next((r for r in rows[:-1] if r["period"][:2] == rows[-1]["period"][:2]
                         and r["period"] != rows[-1]["period"]), None)
        if year_ago:
            deltas["yoy"] = _delta(rows[-1], year_ago)
    return {"ticker": ticker, "quarters": rows, "deltas": deltas,
            "note": "All values as stored from results filings (₹ crore). Cite the metrics tool for numbers."}


def _delta(a: dict, b: dict) -> dict:
    out = {}
    for k in ("revenue_cr", "ebitda_cr", "pbt_cr", "pat_cr"):
        if a.get(k) is not None and b.get(k) not in (None, 0):
            out[k] = round((a[k] - b[k]) / abs(b[k]) * 100, 1)
    return out


def build_research_analyst() -> LlmAgent:
    return LlmAgent(
        name="research_analyst",
        model=LiteLlm(model=f"openai/{MODEL_REASONING}"),
        instruction=INSTRUCTION,
        tools=[
            FunctionTool(func=filings_rag.search_docs_wrapped),
            FunctionTool(func=quarterly_metrics),
            FunctionTool(func=prices.price_context_wrapped),
            FunctionTool(func=filings_rag.doc_overview_wrapped),
            FunctionTool(func=guidance.scorecard_wrapped),
        ],
        generate_content_config={"temperature": 0.2, "max_output_tokens": 1200},
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
    )
