"""Promise ledger: what management said they would deliver, against what they reported.

1. A fast model pulls explicit, numeric, forward-looking statements out of each
   recent call transcript. Every statement must quote words that really appear in
   the passage it cites, or it is dropped. Results are cached per document.
2. Plain code grades each statement against the reported quarterly numbers:
   kept, missed, revised, gone quiet, too early, or not checkable from reported figures.

The model never decides a verdict.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re

from .. import db
from ..llm import routing

log = logging.getLogger("finn.ledger")

EXTRACT_VERSION = "v5"
# Statements an investor tracks; others (tax rate, amortisation, loan pricing) stay out of the ledger.
_TRACKED = re.compile(r"revenue|sales|growth|ebitda|ebit|margin|profit|cost|capex|debt|leverage|"
                      r"volume|production|capacity|order|deal|dividend|cash|guidance", re.I)
_GUIDE = re.compile(r"\b(guid\w*|expect\w*|target\w*|aspir\w*|outlook|band|range|exit\w*|"
                    r"we will|we should|full year|next year|by fy\w*|trajectory|deliver)\b", re.I)
GRADABLE = {"revenue_growth", "ebitda_margin", "ebit_margin", "pat_margin"}
# Guidance for one part of the company ("India business", "defence margins") cannot be
# checked against the consolidated numbers FINN stores.
_SEGMENT = re.compile(
    r"\b(?:segments?|divisions?|verticals?|subsidiar\w*|exports?|domestic|international|overseas|"
    r"defen[cs]e|aerospace|geograph\w*)\b"
    r"|\b(?!(?:our|the|this|overall|total|whole|entire|consolidated|core)\b)[a-z]+ (?:business|portfolio)\b",
    re.I,
)


def company_level(metric: str | None, quote: str | None) -> bool:
    """Whether a promise is about the whole company rather than one segment or region."""
    return not _SEGMENT.search(f"{metric or ''} {quote or ''}")


# When a promise falls due is read from management's own words, not the model's summary of
# them, so the same quote grades the same way on every build. A target years out is not
# tested by one quarter's numbers; a standing band with no date is tested every quarter.
_LONG_TERM = re.compile(
    r"\b(?:long|medium|mid)[- ]?term\b|\bmulti[- ]?year|\bover (?:a )?(?:period of )?time\b|\bover the years\b|"
    r"\b(?:next|coming|few|couple of|several|two|three|four|five)\s+(?:\w+\s+)?years\b|"
    r"\b\d+\s*(?:to|-)?\s*\d*\s*years\b|\bin due course\b|\beventually\b", re.I)
_NEAR_TERM = re.compile(
    r"\b(?:this|next|current|coming|full|same)\s+(?:financial\s+|fiscal\s+)?(?:year|quarters?|fiscal)\b|"
    r"\bq[1-4]\b|\byear[- ]end\b|\bexit\w*\b|\bby (?:the )?end of the year\b", re.I)
_TARGET_FY = re.compile(r"\bfy\s?(20\d{2}|\d{2})\b|\bmarch\s+(20\d{2})\b|\bby\s+(20\d{2})\b", re.I)
_EBIT = re.compile(r"\bebit\b|\boperating (?:profit )?margins?\b", re.I)
_EBITDA = re.compile(r"\bebitda\b", re.I)


def _call_fy(period: str | None) -> int | None:
    m = re.fullmatch(r"Q[1-4]FY(\d{2})", period or "")
    return int(m.group(1)) if m else None


def _passage(chunk_id) -> str:
    if not chunk_id:
        return ""
    with db.db() as c:
        row = c.execute("SELECT text FROM chunks WHERE id=?", (chunk_id,)).fetchone()
    return row["text"] if row else ""


def quote_context(quote: str, passage: str) -> str:
    """The whole sentence(s) of the passage that the quote was taken from."""
    q, text = _norm(quote or ""), _norm(passage or "")
    words = q.split()
    if len(words) < 4 or not text:
        return q
    start = text.find(" ".join(words[:6]))
    if start < 0:
        return q
    tail = " ".join(words[-4:])
    end = text.find(tail, start)
    end = end + len(tail) if end >= 0 else start + len(q)
    left = text.rfind(". ", 0, start)
    right = text.find(". ", end)
    return text[left + 2 if left >= 0 else 0: right if right >= 0 else len(text)]


def _term_of(text: str, call_fy: int | None) -> tuple[str | None, int | None]:
    years = []
    for m in _TARGET_FY.finditer(text):
        raw = next(g for g in m.groups() if g)
        years.append(int(raw[-2:]))
    if years and call_fy is not None:
        target = max(years)
        return ("long" if target > call_fy + 1 else "near"), target
    if _LONG_TERM.search(text):
        return "long", None
    if _NEAR_TERM.search(text):
        return "near", None
    return None, None


def promise_term(claim: dict, passage: str | None = None) -> tuple[str, int | None]:
    """('near' or 'long', target fiscal year if one is named), from the quote then its sentence."""
    call_fy = _call_fy(claim.get("period"))
    quote = _norm(claim.get("quote") or "")
    term, target = _term_of(quote, call_fy)
    if term is None:
        if passage is None:
            passage = _passage(claim.get("chunk_id"))
        term, target = _term_of(quote_context(claim.get("quote") or "", passage), call_fy)
    return term or "near", target


def margin_kind(kind: str, quote: str, passage: str = "") -> str:
    """EBIT or EBITDA margin by the words management used; a margin they leave unnamed is EBITDA."""
    if kind not in ("ebit_margin", "ebitda_margin"):
        return kind
    for text in (quote, quote_context(quote, passage)):
        if _EBITDA.search(text):
            return "ebitda_margin"
        if _EBIT.search(text):
            return "ebit_margin"
    return "ebitda_margin"


def checkable_now(claim: dict) -> bool:
    """A company-wide promise that the latest quarter can fairly be held to."""
    return company_level(claim.get("metric"), claim.get("quote")) and promise_term(claim)[0] == "near"

EXTRACT_PROMPT = """You read passages from one company's earnings call and list management's explicit forward-looking commitments that contain a number.

Return JSON: {"claims": [{"chunk": <passage id>, "kind": "revenue_growth" | "ebitda_margin" | "ebit_margin" | "pat_margin" | "other", "metric": "<metric in management's words>", "lo": <number or null>, "hi": <number or null>, "unit": "%" | "bps" | "crore" | "billion" | "other", "horizon": "<when, e.g. FY27, next quarter, medium term>", "quote": "<exact words copied from the passage, at most 30 words>", "speaker": "<name or role if stated, else empty>"}]}

Rules:
- Only statements about the future made by the company's management. Skip analyst questions, past results, and vague words without a number.
- kind "revenue_growth" only for a growth rate in percent. kind "ebit_margin" only when EBIT or operating margin is named; "ebitda_margin" only when EBITDA margin is named or the margin is plainly the EBITDA margin. Absolute targets such as revenue of $5 billion or EBITDA of $6 billion are kind "other".
- Skip tax rates, amortisation periods, interest rates, accounting splits, and deal timing.
- Copy the quote exactly from the passage. Do not paraphrase.
- For a single number put it in both lo and hi. For margin expansion in basis points use unit "bps".
- If there are none, return {"claims": []}."""


def period_key(period: str) -> tuple[int, int]:
    m = re.fullmatch(r"Q([1-4])FY(\d{2})", period or "")
    return (int(m.group(2)), int(m.group(1))) if m else (0, 0)


def recent_transcripts(ticker: str, n: int = 4) -> list[dict]:
    """The newest call transcripts indexed for a company, one per quarter."""
    with db.db() as c:
        rows = c.execute(
            "SELECT url, period, MIN(doc_title) AS title FROM chunks"
            " WHERE ticker=? AND doc_type='transcript' AND period LIKE 'Q_FY__' GROUP BY url, period",
            (ticker,),
        ).fetchall()
    best: dict[str, dict] = {}
    for r in rows:
        best.setdefault(r["period"], {"url": r["url"], "period": r["period"], "title": r["title"]})
    return sorted(best.values(), key=lambda d: period_key(d["period"]), reverse=True)[:n]


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9%.]+", " ", text.lower()).strip()


async def extract_claims(ticker: str, doc: dict) -> int:
    """Pull commitments from one transcript, once per extractor version."""
    with db.db() as c:
        done = c.execute("SELECT 1 FROM guidance_claims WHERE doc_url=? AND version=? LIMIT 1",
                         (doc["url"], EXTRACT_VERSION)).fetchone()
        if done:
            return 0
        chunks = [dict(r) for r in c.execute(
            "SELECT id, text FROM chunks WHERE ticker=? AND url=? ORDER BY seq", (ticker, doc["url"]))]
    from .. import state

    if state.enabled():
        # Another build or instance may already have read this call: reuse its claims.
        await asyncio.to_thread(state.restore_company, ticker)
        with db.db() as c:
            if c.execute("SELECT 1 FROM guidance_claims WHERE doc_url=? AND version=? LIMIT 1",
                         (doc["url"], EXTRACT_VERSION)).fetchone():
                return 0
    candidates = [ch for ch in chunks if _GUIDE.search(ch["text"]) and re.search(r"\d", ch["text"])]
    candidates.sort(key=lambda ch: -len(_GUIDE.findall(ch["text"])))
    candidates = candidates[:10]
    claims: list[dict] = []
    if candidates:
        passages = "\n\n".join(f"[passage {ch['id']}]\n{ch['text'][:1400]}" for ch in candidates)
        try:
            raw = await routing.chat(routing.Tier.FAST, [
                {"role": "system", "content": EXTRACT_PROMPT},
                {"role": "user", "content": passages},
            ], scope="guidance_extraction", json_mode=True, max_tokens=1200, temperature=0.0)
            data = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
            claims = data.get("claims") or []
        except Exception as exc:
            log.warning("guidance extraction failed for %s %s: %s", ticker, doc["period"], exc)
            return 0
    by_id = {ch["id"]: _norm(ch["text"]) for ch in candidates}
    raw_text = {ch["id"]: ch["text"] for ch in candidates}
    kept = 0
    with db.db() as c:
        for cl in claims:
            try:
                chunk_id = int(cl.get("chunk"))
            except (TypeError, ValueError):
                continue
            quote = str(cl.get("quote") or "").strip()
            words = _norm(quote).split()
            # The quote must really be in the cited passage: check its opening words.
            if chunk_id not in by_id or len(words) < 4 or " ".join(words[:6]) not in by_id[chunk_id]:
                continue
            # Analysts ask; management commits. Questions are not promises.
            if "?" in quote or re.match(r"(would|could|can|do|does|did|will|is|are|should) you\b", quote, re.I):
                continue
            kind = cl.get("kind") if cl.get("kind") in GRADABLE | {"other"} else "other"
            kind = margin_kind(kind, quote, raw_text[chunk_id])
            lo, hi = _num(cl.get("lo")), _num(cl.get("hi"))
            hi = lo if hi is None else hi
            lo = hi if lo is None else lo
            c.execute(
                "INSERT INTO guidance_claims(ticker, doc_url, period, kind, metric, lo, hi, unit, horizon,"
                " quote, speaker, chunk_id, version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (ticker, doc["url"], doc["period"], kind, str(cl.get("metric") or kind)[:80],
                 lo, hi, str(cl.get("unit") or "%")[:10],
                 str(cl.get("horizon") or "")[:40], quote[:300], str(cl.get("speaker") or "")[:60],
                 chunk_id, EXTRACT_VERSION),
            )
            kept += 1
        if not kept:
            # Remember that this transcript was read, so it is not sent to the model again.
            c.execute("INSERT INTO guidance_claims(ticker, doc_url, period, kind, metric, quote, version)"
                      " VALUES(?,?,?,?,?,?,?)", (ticker, doc["url"], doc["period"], "none", "", "", EXTRACT_VERSION))
    await asyncio.to_thread(state.record_claims, ticker, doc["url"], EXTRACT_VERSION)
    return kept


def _num(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _delivered(kind: str, series: list[dict], period: str) -> float | None:
    row = next((r for r in series if r["period"] == period), None)
    if not row or not row.get("revenue"):
        return None
    if kind == "revenue_growth":
        q = period[:2]
        prior = [r for r in series if r["period"][:2] == q and period_key(r["period"]) < period_key(period)]
        if not prior or not prior[-1].get("revenue"):
            return None
        return round((row["revenue"] - prior[-1]["revenue"]) / prior[-1]["revenue"] * 100, 1)
    if kind == "ebitda_margin" and row.get("ebitda") is not None:
        return round(row["ebitda"] / row["revenue"] * 100, 1)
    if kind == "ebit_margin" and row.get("ebitda") is not None and row.get("depreciation") is not None:
        return round((row["ebitda"] - row["depreciation"]) / row["revenue"] * 100, 1)
    if kind == "pat_margin" and row.get("pat") is not None:
        return round(row["pat"] / row["revenue"] * 100, 1)
    return None


def _source(chunk_id: int | None) -> dict | None:
    if not chunk_id:
        return None
    with db.db() as c:
        r = c.execute("SELECT id, doc_title, doc_type, period, url FROM chunks WHERE id=?", (chunk_id,)).fetchone()
    if not r:
        return None
    return {"source_id": f"S{r['id']}", "doc_title": r["doc_title"], "doc_type": r["doc_type"],
            "period": r["period"], "url": r["url"]}


def grade(claims: list[dict], series: list[dict], transcript_periods: list[str]) -> list[dict]:
    """Deterministic verdict for each claim. Newest statement per metric per call wins."""
    rows: list[dict] = []
    seen: set[tuple] = set()
    for cl in sorted(claims, key=lambda c: period_key(c["period"]), reverse=True):
        whole = company_level(cl.get("metric"), cl.get("quote"))
        key = (cl["kind"] if cl["kind"] != "other" and whole else cl["metric"].lower(), cl["period"])
        if key in seen:
            continue
        seen.add(key)
        later_quarters = [r["period"] for r in series if period_key(r["period"]) > period_key(cl["period"])]
        later_claims = [o for o in claims if o["kind"] == cl["kind"] and cl["kind"] != "other" and whole
                        and o["unit"] == cl["unit"] and company_level(o.get("metric"), o.get("quote"))
                        and period_key(o["period"]) > period_key(cl["period"])]
        later_calls = [p for p in transcript_periods if period_key(p) > period_key(cl["period"])]
        term, target_fy = promise_term(cl)
        if target_fy is not None:
            # A band for a named year is tested by that year's quarters, not the ones before it.
            later_quarters = [p for p in later_quarters if period_key(p)[0] >= target_fy]
        status, delivered, delivered_period, note = "not_checkable", None, None, ""
        if cl["kind"] in GRADABLE and not whole:
            note = "Guidance for one part of the business; reported numbers are company-wide"
        elif cl["kind"] in GRADABLE and term == "long":
            status, note = "too_early", "A longer-term target; one quarter does not test it"
        elif cl["kind"] in GRADABLE and cl["unit"] in ("%",) and cl["lo"] is not None:
            if target_fy is not None and not later_quarters:
                note = f"Guided for FY{target_fy}; no FY{target_fy} quarter reported yet"
            if later_quarters:
                delivered_period = later_quarters[-1]
                delivered = _delivered(cl["kind"], series, delivered_period)
            if delivered is None:
                status = "too_early" if not later_quarters else "not_checkable"
            elif delivered < cl["lo"]:
                status, note = "missed", f"{delivered:g}% in {delivered_period} against {_band(cl)}"
            else:
                status, note = "kept", f"{delivered:g}% in {delivered_period} against {_band(cl)}"
        if later_claims:
            newer = sorted(later_claims, key=lambda o: period_key(o["period"]))[-1]
            if _band(newer) != _band(cl):
                status = "revised" if status in ("not_checkable", "too_early", "kept", "missed") else status
                note = f"Later guided {_band(newer)} on the {newer['period']} call"
        elif later_calls and cl["kind"] != "other" and whole and status in ("not_checkable", "too_early"):
            status = "gone_quiet"
            note = f"No number given for this on {len(later_calls)} later call{'s' if len(later_calls) > 1 else ''}"
        rows.append({
            "period": cl["period"], "kind": cl["kind"], "metric": cl["metric"],
            "band": _band(cl), "lo": cl.get("lo"), "hi": cl.get("hi"), "unit": cl.get("unit"),
            "horizon": cl["horizon"], "term": term, "quote": cl["quote"], "speaker": cl["speaker"],
            "status": status, "delivered": delivered, "delivered_period": delivered_period, "note": note,
            "company_level": whole,
            "promise_source": _source(cl["chunk_id"]),
            "delivered_source": ({"provider": "Screener quarterly table, compiled from exchange filings",
                                  "period": delivered_period} if delivered is not None else None),
        })
    return rows


def _band(cl: dict) -> str:
    unit = cl.get("unit") or ""
    lo, hi = cl.get("lo"), cl.get("hi")
    if lo is None:
        return "no number given"
    suffix = "%" if unit == "%" else f" {unit}"
    if hi is None or hi == lo:
        return f"{lo:g}{suffix}"
    return f"{lo:g} to {hi:g}{suffix}"


async def build_ledger(ticker: str) -> dict:
    """Extract (cached) and grade the last four calls' commitments for one company."""
    docs = recent_transcripts(ticker, 4)
    await asyncio.gather(*(extract_claims(ticker, d) for d in docs))
    urls = [d["url"] for d in docs]
    claims: list[dict] = []
    if urls:
        marks = ",".join("?" for _ in urls)
        with db.db() as c:
            claims = [dict(r) for r in c.execute(
                f"SELECT * FROM guidance_claims WHERE ticker=? AND version=? AND kind<>'none'"
                f" AND doc_url IN ({marks})", (ticker, EXTRACT_VERSION, *urls))]
    series = [r for r in db.quarterly_series(ticker, limit=12) if r.get("source") != "illustrative_snapshot"]
    claims = [c for c in claims if c["kind"] in GRADABLE or _TRACKED.search(c["metric"] + " " + c["quote"])]
    rows = grade(claims, series, [d["period"] for d in docs])
    # Lead with what can be judged, then the rest of each call's stated targets.
    order = {"missed": 0, "revised": 1, "gone_quiet": 2, "kept": 3, "too_early": 4, "not_checkable": 5}
    rows.sort(key=lambda r: (order.get(r["status"], 9), [-x for x in period_key(r["period"])]))
    rows = rows[:24]
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {
        "ticker": ticker,
        "calls": [{"period": d["period"], "url": d["url"]} for d in docs],
        "rows": rows,
        "counts": counts,
        "summary": summarize(counts),
        "numbers_source": "Screener quarterly table, compiled from exchange filings" if series else None,
    }


def summarize(counts: dict[str, int]) -> str:
    kept, missed = counts.get("kept", 0), counts.get("missed", 0)
    checkable = kept + missed
    noun = "promise" if checkable == 1 else "promises"
    parts = []
    if checkable and kept >= missed:
        parts.append(f"Kept {kept} of {checkable} {noun} that can be checked against reported numbers")
        if missed:
            parts.append(f"missed {missed}")
    elif checkable:
        parts.append(f"Missed {missed} of {checkable} {noun} that can be checked against reported numbers")
    if counts.get("revised"):
        parts.append(f"revised {counts['revised']}")
    if counts.get("gone_quiet"):
        parts.append(f"{counts['gone_quiet']} went quiet")
    if not parts:
        return "No numeric promises found on the recent calls that can be checked yet."
    return ", ".join(parts) + "."


async def promise_ledger(ticker: str) -> dict:
    """Agent tool: management's numeric promises from recent calls, graded against reported results.
    Each row cites the transcript passage (source_id) where the promise was made."""
    ledger = await build_ledger(ticker)
    for row in ledger["rows"]:
        src = row.get("promise_source") or {}
        row["source_id"] = src.get("source_id")
        row["doc_title"] = src.get("doc_title")
        row["url"] = src.get("url")
        row["excerpt"] = row["quote"]
        row["doc_type"] = "transcript"
    return ledger
