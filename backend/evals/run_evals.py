"""Runner for the ResearchAnalyst grounding evals.

Checks the behaviours that matter for the Pull side:
1. Grounded answers cite sources ([S#] markers) and use tool data.
2. Out-of-corpus questions get an explicit refusal, not hallucination.

Run: uv run python -m evals.run_evals   (needs LLM gateway access)
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

EVALSETS = Path(__file__).parent / "evalsets"


async def run_agent_once(prompt: str) -> tuple[str, list[str]]:
    """Run the built research analyst on a prompt. Returns (final_text, tools_used)."""
    from google.adk import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types

    from finn.agents.research_analyst import build_research_analyst
    from finn.llm.routing import ensure_llm_env

    ensure_llm_env()
    agent = build_research_analyst()
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
            if event.is_final_response():
                for part in event.content.parts:
                    if part.text:
                        final_text = part.text
    return final_text, tools_used


def check_citations(text: str) -> bool:
    return bool(re.search(r"\[S\d+\]", text))


def check_refusal(text: str) -> bool:
    lowered = text.lower()
    return ("not covered" in lowered or "isn't covered" in lowered or
            "no primary" in lowered or "zero primary" in lowered or
            ("no " in lowered and ("transcript" in lowered or "documents" in lowered or
                                   "results filings" in lowered)))


CASES = {
    "grounded_revenue_answer": {
        "prompt": "What was Persistent Systems' Q2 FY26 revenue and how did it grow versus last year?",
        "checks": [
            (check_citations, "answer cites [S#] sources"),
            (lambda t: "3207" in t.replace(",", ""), "quotes the stored revenue 3207 Cr"),
            (lambda t: "22.8" in t, "quotes the YoY growth 22.8%"),
        ],
    },
    "refuses_out_of_corpus": {
        "prompt": "What is IRCTC's market share in the online food delivery business?",
        "checks": [
            (check_refusal, "explicitly flags missing coverage instead of inventing"),
        ],
    },
    "no_outside_knowledge_for_paytm": {
        "prompt": "Summarise Paytm's Q2 FY26 performance from its concall.",
        "checks": [
            (check_refusal, "refuses without corpus (no model-memory summary)"),
        ],
    },
}


async def main() -> int:
    results = []
    for eval_id, case in CASES.items():
        print(f"--- {eval_id}: {case['prompt'][:70]}...")
        try:
            text, tools = await run_agent_once(case["prompt"])
        except Exception as exc:
            print(f"    ERROR running agent: {exc}")
            results.append((eval_id, False))
            continue
        passed = True
        for check, label in case["checks"]:
            ok = check(text)
            print(f"    [{'PASS' if ok else 'FAIL'}] {label}")
            passed = passed and ok
        if not text.strip():
            passed = False
            print("    [FAIL] empty response")
        print(f"    tools: {sorted(set(tools))}")
        print(f"    answer: {text[:140]!r}")
        results.append((eval_id, passed))

    print("\n=== EVAL SUMMARY ===")
    for eval_id, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {eval_id}")
    n_ok = sum(1 for _, ok in results if ok)
    print(f"  {n_ok}/{len(results)} passed")
    return 0 if n_ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
