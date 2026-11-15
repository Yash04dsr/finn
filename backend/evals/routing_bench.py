"""Run: PYTHONPATH=. uv run python evals/routing_bench.py

Measure the same bulk jobs on the fast tier (low reasoning) and the reasoning tier."""
import asyncio
import json

import litellm

from finn.llm import routing

JOBS = [
    ("classify", "Classify into one category (results, M&A, management_change, capex, dividend, routine): "
                 "Board approves expansion capex of Rs 300 crore for recycled lead capacity"),
    ("classify", "Classify into one category (results, M&A, management_change, capex, dividend, routine): "
                 "Appointment of Mr. Kalyan Gurazada as Chief Financial Officer of the Bank"),
    ("one_liner", "Write one line (max 18 words) on: Asian Paints - Order from Competition Commission of India; "
                  "penalty of Rs 685 crore imposed"),
]


async def run(tier):
    routing.ensure_llm_env()
    total, answers = 0, []
    for _, prompt in JOBS:
        extra = routing.params_for(tier)
        resp = await litellm.acompletion(model=f"openai/{routing.model_for(tier)}",
                                         messages=[{"role": "user", "content": prompt}],
                                         max_tokens=600, temperature=0.0, **extra)
        total += resp.usage.completion_tokens
        answers.append(routing.strip_think(resp.choices[0].message.content or "")[:70])
    return total, answers


async def main():
    fast = await run(routing.Tier.FAST)
    full = await run(routing.Tier.REASONING)
    print(json.dumps({"fast_tier_output_tokens": fast[0], "reasoning_tier_output_tokens": full[0],
                      "fast_answers": fast[1], "reasoning_answers": full[1]}, indent=1))

asyncio.run(main())
