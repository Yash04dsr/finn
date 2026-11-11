"""RAG tools for the research agent: FTS5 retrieval over AR/transcript/results chunks.

Every result carries doc_title, period, url, and the chunk text so the agent can
cite precisely. A 'reject' contract: if retrieval returns nothing, the agent must
say so rather than hallucinate — the tool result states this explicitly.
"""
from __future__ import annotations

import json

from .. import db


def search_docs(ticker: str, query: str, doc_type: str | None = None,
                limit: int = 5) -> str:
    """FTS5 search over the company's primary documents.

    Returns a JSON string for the ADK function-calling contract.
    """
    hits = db.search_chunks(ticker, query, doc_type=doc_type, limit=limit)
    if not hits:
        return json.dumps({
            "status": "no_results",
            "note": (f"No passages in {ticker}'s documents match this query. "
                     f"Try different words, or tell the user this isn't covered in the "
                     f"available primary sources. DO NOT use outside knowledge."),
            "sources": [],
        })
    sources = []
    for h in hits:
        sources.append({
            "source_id": f"S{h['id']}",
            "doc_type": h["doc_type"],
            "doc_title": h["doc_title"],
            "period": h["period"],
            "url": h.get("url", ""),
            "excerpt": h.get("snippet") or h["text"][:400],
        })
    return json.dumps({"status": "ok", "query": query, "sources": sources})


def doc_overview(ticker: str) -> str:
    """List available primary documents for a ticker so the agent knows its corpus."""
    from ..config import DOCS_DIR

    import json as _json
    manifest = {}
    path = DOCS_DIR / "manifest.json"
    if path.exists():
        manifest = _json.loads(path.read_text()).get(ticker, [])
    counts = {
        "transcripts": db.chunk_count(ticker, "transcript"),
        "annual_reports": db.chunk_count(ticker, "annual_report"),
        "results_filings": db.chunk_count(ticker, "results_filing"),
    }
    return _json.dumps({"ticker": ticker, "chunk_counts": counts,
                        "documents": [{"doc_type": d["doc_type"], "title": d.get("title", ""),
                                       "period": d.get("period", ""), "url": d.get("url", "")}
                                      for d in manifest]})


# --- ADK function-tool wrappers (dict-in/dict-out contract) -------------------------

def search_docs_wrapped(ticker: str, query: str, doc_type: str | None = None,
                        limit: int = 5) -> dict:
    """Search a company's primary documents (annual reports, concall transcripts,
    results filings) for passages relevant to the query. Returns cited sources."""
    result = search_docs(ticker, query, doc_type=doc_type, limit=limit)
    return json.loads(result)


def doc_overview_wrapped(ticker: str) -> dict:
    """List the primary documents available for a ticker (types, periods, counts)."""
    return json.loads(doc_overview(ticker))
