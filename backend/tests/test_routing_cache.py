"""Routing parameters per tier and the research answer cache."""
from __future__ import annotations

from finn import db
from finn.llm import routing


def test_fast_tier_turns_reasoning_down_and_reasoning_tier_keeps_it():
    assert routing.params_for(routing.Tier.FAST) == {"reasoning_effort": "low"}
    assert routing.params_for(routing.Tier.REASONING) == {}


def test_answer_cache_round_trip_and_corpus_version_changes():
    before = db.corpus_version("CACHECO")
    db.cache_put("k1", "CACHECO", "Margins held [1].", [{"n": 1, "id": "S1"}])
    assert db.cache_get("k1")["citations"][0]["id"] == "S1"
    db.add_chunk("CACHECO", "transcript", "Q2 call", "Q2FY27", "https://x.test/a.pdf", 0, "new text")
    assert db.corpus_version("CACHECO") != before
