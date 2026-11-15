"""Customer voice and a hard stop for questions outside markets."""
from __future__ import annotations

import re

OUT_OF_SCOPE_REPLY = "I only answer questions about stocks, filings, and your portfolio."

# Obvious non-market asks. Kept narrow so "list my portfolio" still goes through.
_OFF_TOPIC = re.compile(
    r"""
    linked\s*lists?
    | data\s*structures?
    | leet\s*code
    | binary\s+trees?
    | dynamic\s+programming
    | time\s+complexity
    | big\s*o\b
    | reverse\s+(a\s+|the\s+)?(linked|string|array)
    | (write|code|implement|debug)\s+(me\s+)?(a\s+|some\s+|the\s+)?
        (python|java|javascript|c\+\+|program|function|script|algorithm)
    | \b(python|javascript|java|c\+\+)\s+(code|function|program|script)\b
    | how\s+(do|to)\s+(i\s+)?(code|implement|traverse)
    | \b(recipe|poem|haiku|joke|riddle|homework)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


ADVICE_REPLY = ("I don't give buy, sell, or hold calls. I can show what management promised and delivered, "
                "what changed in the latest results, or what the filings say about a risk.")

_ADVICE = re.compile(
    r"\b(should i (buy|sell|hold|exit|add|invest)|is it (a )?good (time )?to (buy|sell)|"
    r"(buy|sell) or (hold|sell|buy)|target price|price target|will (it|the stock|the share) (go|rise|fall)|"
    r"which stock should|best stock|multibagger)\b",
    re.IGNORECASE,
)
_INJECTION = re.compile(
    r"\b(ignore (all |your |the )?(previous |prior )?instructions|system prompt|developer message|"
    r"you are now|act as|jailbreak|reveal your (prompt|instructions))\b",
    re.IGNORECASE,
)


def out_of_scope_reply(message: str) -> str | None:
    """Return the customer refusal, or None when the question can go to FINN."""
    text = (message or "").strip()
    if not text:
        return None
    if _INJECTION.search(text) or _OFF_TOPIC.search(text):
        return OUT_OF_SCOPE_REPLY
    if _ADVICE.search(text):
        return ADVICE_REPLY
    return None


def plain_voice(text: str) -> str:
    """Turn em dashes and spaced double hyphens into ordinary commas."""
    cleaned = text.replace("—", ", ").replace("–", ", ")
    cleaned = re.sub(r"\s+--\s+", ", ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    cleaned = re.sub(r",(?:\s*,)+", ",", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()
