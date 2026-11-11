"""Runner for the ResearchAnalyst grounding evals.

Checks the three behaviours that matter for the Pull side:
1. Grounded answers cite sources ([S#] markers) for factual claims.
2. Out-of-corpus questions get an explicit refusal, not hallucination.
3. Numbers come from the metrics tool (regex-match stored values).

Run: uv run python -m evals.run_evals
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

EVALSETS = Path(__file__).parent / "evalsets"


async def run_agent_once(prompt: str) -> tuple[str, list[str]]:
    """Run the research analyst directly on a prompt. Returns (final_text, tool_names)."""
    from google.adk import Runner
    from google.adk.agents import LlmAgent
    from google.adk.models.lite_llm import LiteLlm
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    from finn.agents.research_analyst import INSTRUCTION
    from finn.config import MODEL_REASONING
    from finn.llm.routing import ensure_llm_env
    from finn.tools import filings_rag, prices

    from finn.agents.research_analyst import quarterly_metrics

    ensure_llm_env()
    agent = LlmAgent(
        name="research_analyst",
        model=LiteLlm(model=f"openai/{MODEL_REASONING}"),
        instruction=INSTRUCTION,
        tools=[
            filings_rag.search_docs_wrapped,
            quarterly_metrics,
            prices.price_context_wrapped,
            filings_rag.doc_overview_wrapped,
        ],
        generate_content_config={"temperature": 0.2, "max_output_tokens": 1500},
    )
    runner = Runner(app_name="finn_eval", agent=agent,
                    session_service=InMemorySessionService())
    session = await runner.session_service.create_session(app_name="finn_eval", user_id="eval")
    final_text = ""
    tools_used: list[str] = []
    async for event in runner.run_async(
        user_id="eval", session_id=session.id,
        new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
    ):
        if getattr(event, "tool_name", None):
            tools_used.append(event.tool_name)
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    final_text = part.text
    return final_text, tools_used


def check_citations(text: str) -> bool:
    return bool(re.search(r"\[S\d+\]", text)) or "not covered" in text.lower() or \
        "isn't covered" in text.lower()


def check_refusal(text: str) -> bool:
    lowered = text.lower()
    return ("not covered" in lowered or "isn't covered" in lowered or
            "no " in lowered and ("transcript" in lowered or "documents" in lowered))


def check_number(text: str, expected: str) -> bool:
    return expected in text.replace(",", "")


CHECKS = {
    "grounded_revenue_answer": [
        (lambda t, tools: check_citations(t), "answer cites sources or refuses"),
        (lambda t, tools: check_number(t, "3207"), "quotes the stored revenue 3207"),
        (lambda t, tools: bool(tools), "used at least one tool"),
    ],
    "refuses_out_of_corpus": [
        (lambda t, tools: check_refusal(t), "explicitly refuses / flags missing coverage"),
    ],
    "no_outside_knowledge_for_paytm": [
        (lambda t, tools: check_refusal(t), "refuses without corpus"),
    ],
}


async def main() -> int:
    evalset = json.loads((EVALSETS / "research_analyst.json").read_text())
    results = []
    for case in evalset["cases"]:
        eval_id = case["eval_id"]
        prompt = case["conversation"][0]["user_content"]
        print(f"--- {eval_id}: {prompt[:70]}...")
        try:
            text, tools = await run_agent_once(prompt)
        except Exception as exc:
            print(f"    ERROR running agent: {exc}")
            results.append((eval_id, False))
            continue
        passed = True
        for check, label in CHECKS.get(eval_id, []):
            ok = check(text, tools)
            print(f"    [{'PASS' if ok else 'FAIL'}] {label}")
            passed = passed and ok
        if not text.strip():
            passed = False
            print("    [FAIL] empty response")
        print(f"    answer: {text[:160]!r}")
        results.append((eval_id, passed))

    print("\n=== EVAL SUMMARY ===")
    for eval_id, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {eval_id}")
    n_ok = sum(1 for _, ok in results if ok)
    print(f"  {n_ok}/{len(results)} passed")
    return 0 if n_ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
