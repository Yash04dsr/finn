"""Announcements lookup tools for the research agent + digest."""
from __future__ import annotations

import json

from .. import db


def recent_filings(ticker: str, limit: int = 15) -> str:
    rows = db.recent_filings(ticker, limit=limit)
    return json.dumps([{
        "category": r["category"], "headline": r["headline"],
        "filed_at": r["filed_at"], "url": r.get("body", "") if r.get("body", "").startswith("http") else "",
    } for r in rows])
