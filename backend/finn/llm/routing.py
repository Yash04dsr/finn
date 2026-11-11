"""Two-tier model routing via LiteLLM + Hyde gateway.

FAST tier (hyde/glm-5.3-flash): bulk classification, one-liners, formatting, small talk.
REASONING tier (hyde/kimi-k3): grounded synthesis, narrative-vs-numbers, bull/bear.

Every call records token usage into the cost ledger — cost discipline is a feature.
"""
from __future__ import annotations

import os

from .. import db
from ..config import HYDE_API_KEY, HYDE_BASE_URL, MODEL_FAST, MODEL_REASONING

_env_ready = False


def ensure_llm_env() -> None:
    """Set OpenAI-compatible env vars once so LiteLlm (ADK) and litellm pick them up."""
    global _env_ready
    if _env_ready:
        return
    os.environ["OPENAI_API_KEY"] = HYDE_API_KEY
    os.environ["OPENAI_API_BASE"] = HYDE_BASE_URL
    os.environ.setdefault("LITELLM_LOG", "ERROR")
    _env_ready = True


class Tier:
    FAST = "fast"
    REASONING = "reasoning"


TIER_MODELS = {Tier.FAST: MODEL_FAST, Tier.REASONING: MODEL_REASONING}


def model_for(tier: str) -> str:
    return TIER_MODELS.get(tier, MODEL_FAST)


def record_usage(scope: str, tier: str, usage) -> dict:
    """Pull token usage off a LiteLLM/ADK response and log it to the cost ledger."""
    usage_dict = {"prompt_tokens": 0, "completion_tokens": 0}
    try:
        usage_dict["prompt_tokens"] = getattr(usage, "prompt_tokens", 0) or 0
        usage_dict["completion_tokens"] = getattr(usage, "completion_tokens", 0) or 0
    except Exception:
        pass
    db.log_cost(scope, model_for(tier), usage_dict["prompt_tokens"],
                usage_dict["completion_tokens"])
    return usage_dict


def strip_think(text: str) -> str:
    """Extract the visible answer from a thinking model's output."""
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    return _trim_to_answer(text)


def _trim_to_answer(text: str) -> str:
    """Reasoning-salvage mode: take the best span, dropping meta-commentary."""
    # 1. If a complete JSON object exists anywhere, return it whole.
    if "{" in text and "}" in text:
        start, end = text.index("{"), text.rindex("}")
        candidate = text[start:end + 1]
        try:
            import json as _json
            _json.loads(candidate)
            return candidate
        except (ValueError, JSONDecodeError):
            pass
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if not lines:
        return ""
    # 2. Prefer a quoted draft (the model often rehearses in quotes).
    import re
    quoted = re.findall(r'"([^"]{20,})"', text)
    if quoted:
        return max(quoted, key=len).strip()
    # 3. Drop obvious meta lines and take the longest remaining line.
    meta = ("count", "words:", "word count", "that's", "options:", "let me", "i'll",
            "wait", "check:", "hmm", "actually", "total:", "draft:", "answer:")
    candidates = [l for l in lines
                  if not any(m in l.lower()[:14] for m in meta)]
    pool = candidates or lines
    return max(pool, key=len)


class JSONDecodeError(ValueError):
    pass


async def chat(tier: str, messages: list[dict], scope: str, json_mode: bool = False,
               max_tokens: int = 700, temperature: float = 0.2) -> str:
    """One-shot completion through the routing layer (used by pipeline steps, not ADK).

    The Hyde fast model is a thinking model: it can burn the whole token budget
    on invisible reasoning. We therefore budget headroom, and if visible content
    comes back empty we salvage the final line of the reasoning trace.
    """
    import litellm

    ensure_llm_env()
    budget = min(max_tokens * 3, 4000)  # headroom for thinking tokens
    resp = await litellm.acompletion(
        model=f"openai/{model_for(tier)}",
        messages=messages,
        max_tokens=budget,
        temperature=temperature,
        **({"response_format": {"type": "json_object"}} if json_mode else {}),
    )
    record_usage(scope, tier, resp.usage)
    choice = resp.choices[0]
    content = choice.message.content or ""
    if not content.strip():
        reasoning = getattr(choice.message, "reasoning_content", None) or ""
        if reasoning:
            tail = [l for l in reasoning.strip().splitlines() if l.strip()]
            content = tail[-1] if tail else ""
    return strip_think(content)
