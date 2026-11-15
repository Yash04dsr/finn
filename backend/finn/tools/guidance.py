"""Guidance Scorecard — promises vs delivery, deterministic and cited.

Extracts management guidance claims from stored concall transcripts (rule-based
extraction of the numbers management committed to), then grades each claim
against the delivered quarterly series. The LLM never decides a verdict; this
module does. Every claim carries its source passage for [S#] citation.
"""
from __future__ import annotations

import json
import re

from .. import db

# --- claim extraction -----------------------------------------------------------

# "EBITDA margins of 18 to 19 percent" / "margins in the 18 to 19 percent range"
_RANGE_MARGIN = re.compile(
    r"(?:EBITDA\s+)?margins?\s+(?:of|in|at|about)\s+(?:about\s+)?(\d{1,2}(?:\.\d)?)\s*(?:to|-|–)\s*(\d{1,2}(?:\.\d)?)\s*(?:percent|%)", re.I)
# "EBITDA margins in the 12 to 13 percent band" / "...margin ... remains in the 12 to 13 percent band"
_BAND_MARGIN = re.compile(
    r"(?:EBITDA\s+)?margins?\b.{0,80}?in\s+the\s+(\d{1,2}(?:\.\d)?)\s*(?:to|-|–)\s*(\d{1,2}(?:\.\d)?)\s*(?:percent|%)", re.I)
# "revenue growth of 18 to 22 percent" / "revenue growth guidance of 18 to 22 percent"
_RANGE_GROWTH = re.compile(
    r"(?:revenue\s+)?growth\s+(?:guidance\s+)?(?:of|in)\s+(?:the\s+)?(?:about\s+)?(\d{1,2})\s*(?:to|-|–)\s*(\d{1,2})\s*(?:percent|%)", re.I)
# "growing faster than the industry" (qualitative — tracked, not graded numerically)
_QUALITATIVE = re.compile(r"(growing faster than the industry)", re.I)
# "exit EBITDA margin of 19 percent" / "exit the year at about 19 percent EBITDA margin"
_EXIT_MARGIN = re.compile(
    r"exit\s+(?:(?:the\s+year\s+)?(?:at\s+about\s+|at\s+|of\s+)?(?:about\s+)?(\d{1,2}(?:\.\d)?)\s*(?:percent|%)\s*(?:EBITDA\s+)?margin|EBITDA\s+margin\s+of\s+(\d{1,2}(?:\.\d)?))", re.I)
_EXIT_MARGIN_PRE = re.compile(
    r"(?:EBITDA\s+)?margin[.\s,]*(?:we\s+)?expect\s+to\s+exit\s+the\s+year\s+at\s+about\s+(\d{1,2}(?:\.\d)?)\s*(?:percent|%)", re.I)
# "low twenties percentage band" (transcript phrasing)
_LOW_TWENTIES = re.compile(r"low\s+twenties", re.I)


def _latest_transcript_claims(ticker: str) -> list[dict]:
    """Pull transcript paragraphs that contain guidance language, newest period first."""
    hits = db.search_chunks(ticker, "guidance reiterate margin growth", doc_type="transcript", limit=8)
    # broaden when the strict query misses (FTS ANDs all terms)
    if not hits:
        hits = db.search_chunks(ticker, "guidance margin", doc_type="transcript", limit=8)
    if not hits:
        # final fallback: scan all transcript chunks for guidance language
        hits = [h for h in db.chunks_for(ticker, doc_type="transcript", limit=40)
                if re.search(r"guidance|reiterate|we guide|we target|we expect|band|exit", h["text"], re.I)]
    periods: list[str] = []
    seen: set[int] = set()
    out: list[dict] = []
    for h in hits:
        text = h["text"]
        if not re.search(r"guidance|reiterate|we guide|we target|we expect|band|exit", text, re.I):
            continue
        if h["id"] in seen:
            continue
        seen.add(h["id"])
        periods.append(h["period"])
        out.append({
            "chunk_id": h["id"],
            "period": h["period"],
            "doc_title": h["doc_title"],
            "url": h.get("url", ""),
            "text": text,
        })
    # order newest-first by period label
    out.sort(key=lambda c: c["period"], reverse=True)
    return out


def _claims_for_ticker(ticker: str) -> list[dict]:
    """Deduplicate to the newest claim per claim-type per period."""
    claims = _latest_transcript_claims(ticker)
    out: list[dict] = []
    for c in claims:
        text = c["text"]
        low = text.lower()
        # classify claim types present in this passage
        kinds: list[str] = []
        m_growth = _RANGE_GROWTH.search(text) or (_LOW_TWENTIES.search(text) and "revenue" in low)
        m_exit = _EXIT_MARGIN.search(text) or _EXIT_MARGIN_PRE.search(text)
        m_margin = (_RANGE_MARGIN.search(text) or _BAND_MARGIN.search(text)) and not m_exit
        if m_growth:
            kinds.append("revenue_growth")
        if m_margin:
            kinds.append("ebitda_margin")
        if m_exit:
            kinds.append("ebitda_exit_margin")
        for kind in kinds:
            out.append({**c, "kind": kind})
    return out


# --- verdict computation ----------------------------------------------------------

def _yoy_growth(series: list[dict], period: str) -> float | None:
    cur = next((r for r in series if r["period"] == period), None)
    if not cur or not cur.get("revenue"):
        return None
    yq = period[:2]
    prev = next((r for r in series if r["period"][:2] == yq and r["period"] != period), None)
    if not prev or not prev.get("revenue"):
        return None
    return round((cur["revenue"] - prev["revenue"]) / prev["revenue"] * 100, 1)


def _margin_for(series: list[dict], period: str) -> float | None:
    r = next((r for r in series if r["period"] == period), None)
    if r and r.get("revenue") and r.get("ebitda"):
        return round(r["ebitda"] / r["revenue"] * 100, 1)
    return None


def _grade(kind: str, claimed_lo: float | None, claimed_hi: float | None,
           delivered: float | None) -> dict:
    """Compare one delivered number against its claimed band → verdict + delta."""
    if delivered is None:
        return {"verdict": "pending", "delivered": None}
    if claimed_lo is None:
        return {"verdict": "unverifiable", "delivered": delivered}
    # exit-margin claims: delivered margin already at/above target = on track
    lo, hi = (claimed_lo, claimed_hi) if claimed_hi is not None else (claimed_lo, claimed_lo)
    if delivered < lo:
        return {"verdict": "behind", "delivered": delivered,
                "gap": round(delivered - lo, 1)}
    if delivered > hi:
        return {"verdict": "ahead", "delivered": delivered,
                "gap": round(delivered - hi, 1)}
    return {"verdict": "on_track", "delivered": delivered,
            "within": [lo, hi]}


def _parse_claim(kind: str, text: str) -> tuple[float | None, float | None, str]:
    """Return (lo, hi, quote) for a claim kind from its passage."""
    if kind == "revenue_growth":
        m = _RANGE_GROWTH.search(text)
        if m:
            return float(m.group(1)), float(m.group(2)), m.group(0)
        if _LOW_TWENTIES.search(text):
            return 20.0, 23.0, "low twenties (percentage band)"
        return None, None, ""
    if kind in ("ebitda_margin", "ebitda_exit_margin"):
        for rx in (_EXIT_MARGIN, _EXIT_MARGIN_PRE, _RANGE_MARGIN, _BAND_MARGIN):
            m = rx.search(text)
            if m:
                # _EXIT_MARGIN may capture the number in group 1 or 2 depending on phrasing
                raw_lo = m.group(1) or m.group(2) if rx is _EXIT_MARGIN else m.group(1)
                raw_hi = m.group(2) if (rx is _EXIT_MARGIN and m.group(1) and m.group(2)) else (
                    m.group(2) if rx is not _EXIT_MARGIN and m.lastindex and m.lastindex >= 2 else None)
                lo = float(raw_lo)
                hi = float(raw_hi) if raw_hi else lo
                return lo, hi, m.group(0)
    return None, None, ""


def scorecard(ticker: str) -> dict:
    """Full guidance scorecard: claims extracted from transcripts, graded vs delivery.

    Deterministic: regex-extract claim → compute delivered number from stored
    quarterly series → grade. Citations point at the transcript chunk (chunk_id
    maps to the S# the RAG layer would assign).
    """
    series = [
        row for row in db.quarterly_series(ticker, limit=8)
        if row.get("source") != "illustrative_snapshot"
    ]
    claims_raw = _claims_for_ticker(ticker)
    latest_period = series[-1]["period"] if series else None

    entries: list[dict] = []
    for c in claims_raw:
        lo, hi, quote = _parse_claim(c["kind"], c["text"])
        if lo is None:
            continue
        if c["kind"] == "revenue_growth":
            delivered = _yoy_growth(series, latest_period) if latest_period else None
            unit = " YoY revenue growth"
        else:
            delivered = _margin_for(series, latest_period) if latest_period else None
            unit = " EBITDA margin" if c["kind"] == "ebitda_margin" else " exit EBITDA margin"
        grade = _grade(c["kind"], lo, hi, delivered)
        entries.append({
            "kind": c["kind"],
            "claim_period": c["period"],
            "claimed": {"lo": lo, "hi": hi, "quote": quote, "unit": unit},
            "delivered_period": latest_period,
            **grade,
            "source": {
                "source_id": f"S{c['chunk_id']}",
                "doc_type": "transcript",
                "chunk_id": c["chunk_id"],
                "doc_title": c["doc_title"],
                "period": c["period"],
                "url": c.get("url", ""),
                "excerpt": c["text"][:280],
            },
        })

    # one row per (kind, claim_period), newest claim wins
    seen: dict[tuple, dict] = {}
    for e in entries:
        key = (e["kind"], e["claim_period"])
        seen.setdefault(key, e)

    rows = sorted(seen.values(), key=lambda e: (e["kind"], e["claim_period"]), reverse=True)

    graded = [e for e in rows if e["verdict"] in ("ahead", "on_track", "behind")]
    streak = {
        "ahead": sum(1 for e in graded if e["verdict"] == "ahead"),
        "on_track": sum(1 for e in graded if e["verdict"] == "on_track"),
        "behind": sum(1 for e in graded if e["verdict"] == "behind"),
    }
    credibility = ("Strong" if streak["behind"] == 0 and (streak["ahead"] + streak["on_track"]) >= 2
                   else "Watch" if streak["behind"] <= 1 else "Challenged")
    return {
        "ticker": ticker,
        "delivered_period": latest_period,
        "claims": rows,
        "streak": streak,
        "credibility": credibility,
        "note": ("Verdicts computed deterministically from stored quarterly numbers vs "
                 "guidance extracted from transcripts. Cite the claim source for each row."),
    }


def scorecard_wrapped(ticker: str) -> dict:
    """Agent tool: guidance scorecard for a ticker (promises vs delivery, cited)."""
    return scorecard(ticker)


if __name__ == "__main__":
    import sys
    print(json.dumps(scorecard(sys.argv[1] if len(sys.argv) > 1 else "PERSISTENT"), indent=2))
