"""Hybrid announcement classifier: deterministic keywords first, LLM only for ambiguous ones.

Cost discipline: ~80% of filings are classified with regex keywords (0 tokens).
Only ambiguous headlines hit the FAST model, in one batched call.
"""
from __future__ import annotations

import asyncio
import json
import re

from ..llm import routing

CATEGORIES = [
    "results", "M&A", "fund_raise", "management_change", "litigation",
    "insider_trading", "earnings_call", "investor_meetings", "credit_rating",
    "dividend", "bonus_split", "capex", "press_release", "postal_ballot",
    "agm_egm", "pledging", "unclassified",
]

# Priority weight per category — how much the category alone moves attention.
CATEGORY_PRIORITY = {
    "results": 1, "M&A": 1, "management_change": 1, "litigation": 1,
    "fund_raise": 2, "insider_trading": 2, "capex": 2, "pledging": 2,
    "credit_rating": 3, "dividend": 3, "earnings_call": 3, "bonus_split": 3,
    "press_release": 3, "investor_meetings": 3, "postal_ballot": 3,
    "agm_egm": 3, "unclassified": 4,
}

# Bury-list: pure paperwork that never earns a push by itself.
ROUTINE_CATEGORIES = {"unclassified"}

KEYWORDS: dict[str, list[str]] = {
    "results": [r"\bfinancial results\b", r"\bquarterly results\b", r"\boutcome of board meeting\b",
                r"results for the quarter", r"board meeting.*results", r"q[1-4] fy\d+ results",
                r"audited financial results", r"un-?audited financial results", r"shareholder letter"],
    "M&A": [r"\bacquisition\b", r"\bmerger\b", r"\bdemerger\b", r"\bjoint venture\b",
            r"\bacquire\b", r"\bdivestment\b", r"\bstake in\b.*subsidiary", r"\bamalgamation\b"],
    "fund_raise": [r"\bqip\b", r"\brights issue\b", r"\bbuyback\b", r"\bbuy-back\b",
                   r"\bpreferential allotment\b", r"\bcommercial paper\b", r"\bnon-convertible debentures\b",
                   r"\bwarrants?\b.*allot", r"\bfund raising\b", r"\bfundraising\b"],
    "management_change": [r"\bcfo\b", r"\bceo\b", r"\bchief financial officer\b", r"\bchief executive officer\b",
                          r"\bmanaging director\b", r"\bappointment of\b", r"\bresignation\b",
                          r"\bdirector.*resign", r"\bretirement\b.*director", r"\bkey managerial personnel\b",
                          r"\bcso\b", r"\bcompany secretary\b.*appointment"],
    "litigation": [r"\bcourt\b", r"\blawsuit\b", r"\bcci\b", r"\bcompetition commission\b",
                   r"\bsebi order\b", r"\bpenalty\b", r"\binsolvency\b", r"\bnclt\b", r"\busfda\b",
                   r"\bshow cause\b", r"\bfine\b.*impos", r"\btax demand\b", r"\bappeal\b"],
    "insider_trading": [r"\bpit regulation", r"\bpromoter.*acqui", r"\bpromoter.*sold\b",
                        r"\binsider trading\b", r"\bpromoter.*purchas", r"\bpromoter.*disclosure\b"],
    "earnings_call": [r"\bearnings call\b", r"\bconference call\b", r"\bearnings conference\b",
                      r"\btranscript of\b.*call", r"\brecording of\b.*call"],
    "investor_meetings": [r"\binvestor meet", r"\banalyst meet", r"\binstitutional investor",
                          r"\bone-on-one\b", r"\binvestor conference\b"],
    "credit_rating": [r"\bcredit rating\b", r"\bcrisil\b", r"\bicra\b", r"\bcare ratings\b",
                      r"\bmoody", r"\bs\b&p\b", r"\bfitch\b", r"\brating.*reaffirm", r"\brating.*upgrad",
                      r"\brating.*downgrad"],
    "dividend": [r"\bdividend\b", r"\brecord date\b"],
    "bonus_split": [r"\bbonus issue\b", r"\bstock split\b", r"\bsub-?division of shares\b",
                    r"\bbonus debenture\b"],
    "capex": [r"\bcapex\b", r"\bcapacity expansion\b", r"\bnew plant\b", r"\bgreenfield\b",
              r"\bmanufacturing facility\b", r"\bcommercial production\b", r"\bcommissioning\b"],
    "postal_ballot": [r"\bpostal ballot\b", r"\be-?voting result"],
    "agm_egm": [r"\bagm\b", r"\begm\b", r"\bgeneral meeting\b", r"\bannual report\b.*_submit",
                r"\bscrutinizer report\b"],
    "pledging": [r"\bpledge\b", r"\bencumbranc"],
    "press_release": [r"\bpress release\b", r"\blaunch", r"\border win\b", r"\borders? worth\b",
                      r"\bpartnership\b", r"\bclarification\b", r"\bbusiness update\b",
                      r"\bnew product\b", r"\bmo[u]\b"],
}

_AMBIGUOUS = re.compile(
    r"^(intimation|allotment|corrigendum|addendum|newspaper|advertisement|compliance|"
    r"certificate|disclosure|announcement under|regulation)",
    re.IGNORECASE)

# Fast heuristic: these prefixes are almost always routine paperwork — bury them.
_ROUTINE_PREFIX = re.compile(
    r"^(intimation|allotment|corrigendum|addendum|newspaper|advertisement|compliance|"
    r"certificate|shareholding pattern|loss of share|duplicate share)",
    re.IGNORECASE)


def keyword_classify(headline: str, body: str = "") -> tuple[str, float] | None:
    """Return (category, confidence) via keyword hits, or None if ambiguous."""
    text = f"{headline} {body}".lower()
    scores: dict[str, int] = {}
    for cat, patterns in KEYWORDS.items():
        hits = sum(1 for p in patterns if re.search(p, text, re.IGNORECASE))
        if hits:
            scores[cat] = hits
    if not scores:
        if _ROUTINE_PREFIX.match(headline):
            return ("unclassified", 0.9)
        return None
    best = max(scores, key=scores.get)
    second = sorted(scores.values(), reverse=True)
    # Confidence: clear single winner vs tie.
    if len(second) > 1 and second[0] == second[1]:
        return (best, 0.55)
    return (best, min(0.95, 0.6 + 0.15 * scores[best]))


async def classify_batch(items: list[dict]) -> list[dict]:
    """Classify a list of {headline, body}. Returns same list + category + confidence + how."""
    out = []
    needs_llm: list[int] = []
    for i, item in enumerate(items):
        kw = keyword_classify(item.get("headline", ""), item.get("body", ""))
        if kw and kw[1] >= 0.6:
            out.append({**item, "category": kw[0], "confidence": kw[1], "how": "keywords"})
        else:
            out.append({**item, "category": "unclassified", "confidence": 0.0, "how": "pending"})
            needs_llm.append(i)

    if needs_llm:
        llm_results = await _llm_classify([items[i] for i in needs_llm])
        for idx, res in zip(needs_llm, llm_results):
            out[idx].update(res)
            out[idx]["how"] = "llm_fast"
    return out


async def _llm_classify(items: list[dict]) -> list[dict]:
    """One batched FAST-model call for all ambiguous items."""
    payload = [
        {"id": i, "headline": it.get("headline", ""), "body": (it.get("body") or "")[:200]}
        for i, it in enumerate(items)
    ]
    prompt = (
        "Classify each corporate announcement into exactly one category: "
        + ", ".join(CATEGORIES)
        + ".\nRules: 'results' covers board meetings approving results and results filings. "
        "'M&A' includes stake purchases and JV changes. USFDA/regulatory observations are 'litigation'. "
        "Routine ESOP/compliance/shareholding/certificates are 'unclassified'.\n"
        "Return JSON: {\"results\": [{\"id\": int, \"category\": str}]}\n\n"
        "Announcements:\n" + json.dumps(payload, indent=1)
    )
    try:
        raw = await routing.chat(routing.Tier.FAST, [
            {"role": "system", "content": "You are a precise financial filing classifier. Output JSON only."},
            {"role": "user", "content": prompt},
        ], scope="classifier", json_mode=True, max_tokens=600)
        raw = routing.strip_think(raw)
        data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
        by_id = {r["id"]: r.get("category", "unclassified") for r in data.get("results", [])}
        results = []
        for i in range(len(items)):
            cat = by_id.get(i, "unclassified")
            if cat not in CATEGORIES:
                cat = "unclassified"
            results.append({"category": cat, "confidence": 0.75})
        return results
    except Exception:
        return [{"category": "unclassified", "confidence": 0.0} for _ in items]
