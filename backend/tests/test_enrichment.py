"""Management-change enrichment reads the profile the filing itself must carry."""
from __future__ import annotations

import json

import pytest

from finn.alerts import enrichers

FILING = """Intimation under Regulation 30 of SEBI (LODR) Regulations, 2015

The Board has appointed Mr. Kalyan Gurazada as Chief Financial Officer with effect from November 14, 2025.

Brief profile of Mr. Kalyan Gurazada
Mr. Gurazada is a Chartered Accountant with over 22 years of experience in banking finance. Prior to joining the Bank,
he was Chief Financial Officer at a large private sector bank and earlier led treasury accounting at a global bank."""


@pytest.mark.asyncio
async def test_bio_comes_from_the_filing_profile(monkeypatch):
    async def fake_chat(tier, messages, **kwargs):
        return json.dumps({
            "name": "Kalyan Gurazada", "role": "Chief Financial Officer",
            "background": "A chartered accountant with 22 years in banking finance, previously a bank CFO.",
            "evidence": "Chartered Accountant with over 22 years of experience in banking finance",
        })

    monkeypatch.setattr(enrichers.routing, "chat", fake_chat)
    bio = await enrichers._bio_from_text(enrichers._profile_text(FILING), "Appointment of CFO",
                                         {"source": "Exchange filing", "source_url": "https://example.test/f.pdf"})
    assert bio["name"] == "Kalyan Gurazada"
    assert bio["source_url"] == "https://example.test/f.pdf"


@pytest.mark.asyncio
async def test_bio_with_evidence_not_in_the_document_is_rejected(monkeypatch):
    async def fake_chat(tier, messages, **kwargs):
        return json.dumps({
            "name": "Kalyan Gurazada", "role": "CFO",
            "background": "Former partner at a consulting firm.",
            "evidence": "spent a decade as a partner at a global consulting firm",
        })

    monkeypatch.setattr(enrichers.routing, "chat", fake_chat)
    assert await enrichers._bio_from_text(FILING, "Appointment of CFO", {}) is None
