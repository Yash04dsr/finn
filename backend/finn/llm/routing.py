"""Two-tier model routing via LiteLLM + Hyde gateway.

FAST tier (hyde/glm-5.3-flash): bulk classification, one-liners, formatting, small talk.
REASONING tier (hyde/kimi-k3): grounded synthesis, narrative-vs-numbers, bull/bear.

Every call records token usage into the cost ledger — cost discipline is a feature.
"""
from __future__ import annotations

import json
import os
import re

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
        usage_dict["prompt_tokens"] = (
            getattr(usage, "prompt_tokens", None)
            or getattr(usage, "prompt_token_count", 0)
            or 0
        )
        usage_dict["completion_tokens"] = (
            getattr(usage, "completion_tokens", None)
            or getattr(usage, "candidates_token_count", 0)
            or 0
        )
    except Exception:
        pass
    db.log_cost(scope, model_for(tier), usage_dict["prompt_tokens"],
                usage_dict["completion_tokens"], tier=tier)
    return usage_dict


def strip_think(text: str) -> str:
    """Return only user-facing output, never model scratch work.

    Complete think blocks are removed. Unclosed think blocks are rejected because
    there is no deterministic boundary between private reasoning and an answer.
    """
    if not isinstance(text, str):
        return ""
    private_tag = r"(?:think|analysis|reasoning|scratchpad)"
    text = re.sub(rf"<{private_tag}\b[^>]*>.*?</{private_tag}\s*>", "", text,
                  flags=re.IGNORECASE | re.DOTALL)
    if re.search(rf"</?{private_tag}\b", text, flags=re.IGNORECASE):
        return ""
    return _trim_to_answer(text)


def _trim_to_answer(text: str) -> str:
    """Filter common scratch/meta lines while preserving a visible answer."""
    text = text.strip()
    if not text:
        return ""

    # Structured callers need the object, not prose the model may put around it.
    for start in (match.start() for match in re.finditer(r"\{", text)):
        candidate = text[start:]
        try:
            value, end = json.JSONDecoder().raw_decode(candidate)
        except json.JSONDecodeError:
            pass
        else:
            if isinstance(value, (dict, list)):
                return "" if _contains_meta_text(value) else candidate[:end]

    safe_lines = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or _is_meta_line(line):
            continue
        # Models sometimes append a counter to an otherwise valid answer.
        line = re.split(r"\s*(?:\||[-–—])?\s*(?:count\s+words?|word\s+count)\s*:",
                        line, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        if line:
            safe_lines.append(line)
    return "\n".join(safe_lines)


_META_LINE = re.compile(
    r"^(?:"
    r"(?:count\s+words?|word\s+count|token\s+count|total\s+words?)\s*:"
    r"|(?:analysis|reasoning|thinking|thought|scratchpad|plan|check|draft|final\s+answer|answer)\s*:"
    r"|(?:let\s+me|let's|i(?:'ll|\s+will|\s+should|\s+need\s+to)|we\s+need\s+to)\b"
    r"|need\s+to\b"
    r"|(?:the\s+user|user\s+asks?|system\s+prompt)\b"
    r"|(?:hmm+|wait|actually|checking|options?)\b"
    r")",
    flags=re.IGNORECASE,
)


def _is_meta_line(line: str) -> bool:
    """Whether a line is recognisable model process rather than an answer."""
    return bool(_META_LINE.match(line.strip()))


def _contains_meta_text(value) -> bool:
    """Reject structured output whose keys or values contain model scratch text."""
    if isinstance(value, str):
        return any(_is_meta_line(line) for line in value.splitlines() if line.strip())
    if isinstance(value, dict):
        return any(_contains_meta_text(key) or _contains_meta_text(item)
                   for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_meta_text(item) for item in value)
    return False


async def chat(tier: str, messages: list[dict], scope: str, json_mode: bool = False,
               max_tokens: int = 700, temperature: float = 0.2) -> str:
    """One-shot completion through the routing layer (used by pipeline steps, not ADK).

    The Hyde fast model is a thinking model, so the token budget includes
    headroom. Private reasoning is never promoted to visible output.
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
    return strip_think(content)
