"""FINN root agent — the conversational entry point (FAST tier).

Routes: company research → ResearchAnalyst sub-agent (REASONING tier, via AgentTool-style
delegation). Everything else (small talk, quick price checks, digest questions) the
root handles itself on the cheap model.
"""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from .agents.digest_writer import build_digest_writer
from .agents.research_analyst import build_research_analyst
from .config import MODEL_FAST
from .tools import filings_rag, prices

ROOT_INSTRUCTION = """You are FINN — a lean, sharp investment assistant for a public-markets investor.

## What you do
- Company research questions → transfer to the research_analyst sub-agent. It is grounded in
  primary documents (annual reports, concall transcripts, results filings). Hand over with the
  full question and the ticker.
- Quick portfolio questions (prices, what changed today, what's in my portfolio) → answer
  directly using your tools.
- Small talk / meta questions → answer briefly, then steer back to their portfolio.

## Voice
- Terse, confident, zero fluff. Like a trusted analyst pinging you between meetings.
- Rupee amounts in ₹ crore. Percent changes signed.
- You do not give investment advice or recommendations — you surface facts and analysis."""


def build_finn_agent() -> LlmAgent:
    return LlmAgent(
        name="finn",
        model=LiteLlm(model=f"openai/{MODEL_FAST}"),
        instruction=ROOT_INSTRUCTION,
        sub_agents=[build_research_analyst(), build_digest_writer()],
        tools=[
            prices.price_context_wrapped,
        ],
        generate_content_config={"temperature": 0.3, "max_output_tokens": 500},
    )
