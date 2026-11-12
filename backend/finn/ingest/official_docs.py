"""Download and ingest a compact, verifiable primary-source demo corpus.

Every URL is hosted by the issuer. This module is intentionally separate from
illustrative offline fixtures: a deployment can prove exactly which official
documents back its research answers.
"""
from __future__ import annotations

import json

from .. import db
from ..config import DOCS_DIR
from .docs import ingest_ticker_docs


OFFICIAL_DOCUMENTS: dict[str, list[dict]] = {
    "PERSISTENT": [
        {
            "doc_type": "transcript",
            "title": "Persistent Systems Q2 FY26 Earnings Conference Call",
            "period": "Q2FY26",
            "url": (
                "https://www.persistent.com/wp-content/uploads/2025/10/"
                "analyst-call-transcript-q2fy26.pdf"
            ),
        },
        {
            "doc_type": "results_filing",
            "title": "Persistent Systems Q2 FY26 Investor Presentation",
            "period": "Q2FY26",
            "url": (
                "https://www.persistent.com/wp-content/uploads/2025/10/"
                "analyst-presentation-and-factsheet-q2fy26.pdf"
            ),
        },
        {
            "doc_type": "annual_report",
            "title": "Persistent Systems Annual Report 2024-25",
            "period": "FY25",
            "url": (
                "https://www.persistent.com/wp-content/uploads/2025/06/"
                "persistent-annual-report-2025.pdf"
            ),
        },
    ],
    "CROMPTON": [
        {
            "doc_type": "transcript",
            "title": "Crompton Q1 FY26 Earnings Conference Call",
            "period": "Q1FY26",
            "url": (
                "https://reports.crompton.co.in/shopify/public/files/"
                "C39QR7BfnW_Transcript%20of%20earning%20call.pdf"
            ),
        },
        {
            "doc_type": "results_filing",
            "title": "Crompton Q2 FY26 Investor Presentation",
            "period": "Q2FY26",
            "url": (
                "https://reports.crompton.co.in/shopify/public/files/"
                "bibz7NIvJ9_InvestorPresentation-nov.pdf"
            ),
        },
        {
            "doc_type": "annual_report",
            "title": "Crompton Integrated Annual Report 2024-25",
            "period": "FY25",
            "url": (
                "https://reports.crompton.co.in/shopify/public/files/"
                "IvrMP89Bgk_Integrated%20Annual%20Report.pdf"
            ),
        },
    ],
}


def seed_official_documents() -> dict[str, int]:
    """Ingest missing issuer-hosted PDFs and update the document manifest."""
    stats: dict[str, int] = {}
    manifest: dict[str, list[dict]] = {}
    manifest_path = DOCS_DIR / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
        except (OSError, json.JSONDecodeError):
            manifest = {}

    for ticker, documents in OFFICIAL_DOCUMENTS.items():
        existing_titles = {
            row["doc_title"] for row in db.chunks_for(ticker, limit=5000)
        }
        missing = [d for d in documents if d["title"] not in existing_titles]
        stats[ticker] = ingest_ticker_docs(ticker, missing, max_docs=len(missing))
        trusted_titles = {d["title"] for d in documents}
        if trusted_titles.issubset(
            {row["doc_title"] for row in db.chunks_for(ticker, limit=5000)}
        ):
            db.retain_chunks(ticker, trusted_titles)
        manifest[ticker] = documents

    # The old IRCTC fixture was illustrative text with no authoritative URL.
    # Until an issuer-hosted document is configured, absence is the truthful state.
    db.retain_chunks("IRCTC", set())
    manifest.pop("IRCTC", None)

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    if not manifest_path.exists() or manifest_path.read_text() != rendered:
        manifest_path.write_text(rendered)
    return stats


if __name__ == "__main__":
    print(json.dumps(seed_official_documents(), indent=2))
