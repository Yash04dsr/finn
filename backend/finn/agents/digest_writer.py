"""DigestWriter — FAST-tier formatting agent for digest one-liners."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from ..config import MODEL_FAST

INSTRUCTION = """You write one-line summaries of corporate announcements for an investor's digest.

Rules:
- ONE sentence, max 18 words. No filler. Lead with what happened and the number that matters.
- For results filings: name the metric and its YoY direction (e.g. "Q2 revenue up 22.8% YoY to ₹3,207 Cr").
- For management changes: who left/joined and effective when.
- Neutral tone. Never speculate. If the filing is routine paperwork, say exactly that in fewer words.
- Output plain text, nothing else."""


def build_digest_writer() -> LlmAgent:
    return LlmAgent(
        name="digest_writer",
        model=LiteLlm(model=f"openai/{MODEL_FAST}"),
        instruction=INSTRUCTION,
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
        generate_content_config={"temperature": 0.2, "max_output_tokens": 80},
    )
