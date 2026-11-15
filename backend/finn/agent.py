"""FINN agents and how chat reaches them.

Routing is decided in code (finn/llm/intent.py), not by a model:
- a question about a specific company goes to the grounded ResearchAnalyst
  (reasoning tier, primary documents only, citations checked by the server);
- portfolio-wide questions go to this small assistant on the fast tier, which
  only sees prices and the alert feed.
"""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from . import db
from .config import MODEL_FAST
from .llm import routing
from .llm.answer import ANSWER_RULE
from .tools import portfolio, prices

ROOT_INSTRUCTION = """You are FINN. You help one investor keep track of their portfolio. Write the way a person at a brokerage counter would: short, plain, and calm.

## What you answer
- Portfolio-wide questions: what moved, what is in the portfolio, what came in today.
- Use portfolio_overview for holdings and today's alerts, and price_context_wrapped for one stock's recent prices.
- If the investor asks about a company but you cannot tell which one, ask them to name it.

## What you do not answer
- Coding, exams, homework, recipes, jokes, general news, or anything not about listed companies or this portfolio.
- For those, reply with exactly: "I only answer questions about stocks, filings, and your portfolio."
- Company analysis such as guidance, results, or strategy is answered elsewhere from primary documents. Never answer it from memory.

## How you write
- Normal sentences. Periods and commas only. No em dashes, en dashes, or double hyphens.
- No section labels such as "Quick read", "The gap", or "Bottom line".
- State prices and changes in plain words. Do not tell a story about what a move "reads as".
- Do not give buy, sell, or hold advice.
- Show rupee prices with ₹. Show percent changes with a plus or minus sign.
- Never mention tools or your own process in the reply.
- """ + ANSWER_RULE


def portfolio_overview() -> dict:
    """Holdings with their latest close and daily change, plus the alerts from the last 24 hours."""
    alerts = db.feed(since_hours=24, include_read=True)
    return {
        "holdings": portfolio.portfolio_snapshot(),
        "watchlist": portfolio.adhoc_snapshot(),
        "alerts_last_24h": [
            {
                "ticker": a["ticker"],
                "kind": a["kind"],
                "priority": a["priority"],
                "headline": (a["payload"] or {}).get("headline") or a["kind"],
            }
            for a in alerts[:15]
        ],
    }


def build_finn_agent() -> LlmAgent:
    return LlmAgent(
        name="finn",
        model=LiteLlm(model=f"openai/{MODEL_FAST}", **routing.params_for(routing.Tier.FAST)),
        instruction=ROOT_INSTRUCTION,
        tools=[portfolio_overview, prices.price_context_wrapped],
        generate_content_config={"temperature": 0.2, "max_output_tokens": 500},
    )
