"""Separate the reply an investor should see from a thinking model's working.

Agents are told to put the reply inside <answer> tags. Only that text is shown.
Without tags, the reply is kept only if it reads like an answer rather than notes.
"""
from __future__ import annotations

import re

from .routing import strip_think

ANSWER_RULE = (
    "Put the reply the investor will read inside <answer> and </answer>. "
    "Anything outside those tags is never shown, so do your checking outside them "
    "and keep the inside short, plain, and final."
)

_ANSWER = re.compile(r"<answer>(.*?)(?:</answer>|\Z)", re.IGNORECASE | re.DOTALL)
_WORKING = re.compile(
    r"\b(the (user|investor) (asks|wants)|i should|i need to|i've done|let me|"
    r"tool returned|the workflow says|search calls?|i'm at the limit|time to synthesi[sz]e|"
    r"scorecard returned|quarterly_metrics|doc_overview|search_docs|now synthesi[sz]e|keep it short|"
    r"no sources list|plain sentences|no labels)\b",
    re.IGNORECASE,
)


WRITER_PROMPT = (
    "You turn an analyst's working notes into the short reply an investor reads, at most 170 words. "
    "Lead with the direct answer in the first sentence. Use only facts in the notes. Keep every citation "
    "marker exactly as written, such as [S12] or [M3], next to the fact it supports; never invent one. "
    "Plain sentences in two or three short paragraphs, periods and commas only, no dashes, no headings, "
    "no mention of notes, tools, ledgers, or process. If the notes say something cannot be verified, say so plainly. "
    "No buy, sell, or hold advice. Reply inside <answer></answer>."
)


async def rewrite_notes(notes: str, question: str) -> str:
    """Fast-tier fallback: write the investor reply from the analyst's notes."""
    from . import routing

    raw = await routing.chat(routing.Tier.FAST, [
        {"role": "system", "content": WRITER_PROMPT},
        {"role": "user", "content": f"Question: {question}\n\nAnalyst notes:\n{notes[:6000]}"},
    ], scope="research_writer", max_tokens=1300, temperature=0.2)
    import logging

    tagged = [m.group(1).strip() for m in _ANSWER.finditer(raw) if m.group(1).strip()]
    if tagged:
        return tagged[-1]
    if not raw.strip():
        logging.getLogger("finn.answer").warning("writer returned nothing")
    return re.sub(r"</?answer>", "", raw, flags=re.IGNORECASE).strip()


def tagged_answer(raw: str) -> str:
    """The text inside the last <answer> block, or an empty string."""
    tagged = [m.group(1).strip() for m in _ANSWER.finditer(raw or "") if m.group(1).strip()]
    return tagged[-1] if tagged else ""


def visible_answer(raw: str) -> str:
    """Return only investor-facing text, or an empty string when none can be trusted."""
    if not raw:
        return ""
    tagged = tagged_answer(raw)
    if tagged:
        return tagged
    text = strip_think(raw)
    if not _WORKING.search(text):
        return text
    # Working usually comes first and the reply last: keep the clean trailing paragraphs.
    kept: list[str] = []
    for para in reversed([p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]):
        if _WORKING.search(para) or para.endswith(":") or re.match(r"^(answer structure|draft|what i have)\b", para, re.I):
            break
        kept.insert(0, para)
    reply = "\n\n".join(kept)
    return reply if len(reply.split()) >= 12 else ""
