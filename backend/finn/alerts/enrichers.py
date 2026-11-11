"""Push enrichers — the 'so what' layer that makes pushed items earn attention.

- results → deterministic first-cut (Revenue/EBITDA/PBT/PAT, QoQ + YoY) + one FAST-tier line
- management_change → incoming/outgoing exec bio via FAST tier (push-side enrichment,
  explicitly allowed by the brief: professional background, not company analysis)
- everything else → one-liner only when it earns attention, else nothing
"""
from __future__ import annotations

import json
import logging

from ..llm import routing
from ..tools import metrics as metrics_mod

log = logging.getLogger("finn.enrich")


async def enrich_results(ticker: str, filing: dict) -> dict:
    """Results first-cut: deterministic math + a FAST-tier read."""
    cut = metrics_mod.first_cut(ticker)
    facts = None
    if cut:
        facts = {
            "period": cut["period"],
            "rows": [
                {"label": m["label"], "value": m["value"], "qoq_pct": m.get("qoq_pct"),
                 "yoy_pct": m.get("yoy_pct")}
                for m in cut["metrics"].values()
            ],
        }
    one_liner = await _one_liner(filing, facts)
    return {"summary": one_liner, "facts": facts}


async def enrich_management_change(ticker: str, filing: dict) -> dict:
    """Background/bio of the person in the news, per the brief's favourite example."""
    bio = await _exec_bio(filing)
    one_liner = await _one_liner(filing, None)
    return {"summary": one_liner, "bio": bio}


async def enrich_generic(ticker: str, filing: dict) -> dict:
    """One-liner only — and only if the item earns it (priority <= 3 handled upstream)."""
    return {"summary": await _one_liner(filing, None)}


async def _one_liner(filing: dict, facts: dict | None) -> str:
    """FAST tier, tiny output, near-zero cost."""
    fact_note = ""
    if facts:
        fact_note = ("\nComputed facts (use these exact numbers, do not invent any): "
                     + json.dumps(facts))
    prompt = (
        f"Announcement: {filing.get('headline', '')}\n"
        f"Details: {(filing.get('body') or '')[:300]}"
        f"{fact_note}\n"
        "Write ONE line (max 18 words) telling an investor what happened and the number that matters."
    )
    try:
        raw = await routing.chat(routing.Tier.FAST, [
            {"role": "system", "content": "You write ultra-dense one-line filing summaries for investors. Plain text only."},
            {"role": "user", "content": prompt},
        ], scope="enrichment", max_tokens=60, temperature=0.2)
        return routing.strip_think(raw).strip().splitlines()[0][:200]
    except Exception as exc:
        log.warning("one-liner failed: %s", exc)
        return filing.get("headline", "")[:140]


async def _exec_bio(filing: dict) -> dict | None:
    """Professional background of the named executive. Push-side enrichment only."""
    headline = filing.get("headline", "")
    prompt = (
        f"From this exchange filing headline, identify the incoming executive (the person joining):\n"
        f"\"{headline}\"\n\n"
        "If a specific person is named, return JSON {\"name\": str, \"role\": str, "
        "\"background\": one short sentence on their most likely professional profile based ONLY on "
        "the filing text}. If no person is identified, return {\"name\": null}. "
        "Do NOT invent biography details beyond the filing."
    )
    try:
        raw = await routing.chat(routing.Tier.FAST, [
            {"role": "system", "content": "Extract structured data. JSON only."},
            {"role": "user", "content": prompt},
        ], scope="enrichment", json_mode=True, max_tokens=200)
        raw = routing.strip_think(raw)
        data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
        if not data.get("name"):
            return None
        return {"name": data["name"], "role": data.get("role", ""),
                "background": data.get("background", "")}
    except Exception:
        return None
