"""Push enrichers — the 'so what' layer that makes pushed items earn attention.

- results → deterministic first-cut (Revenue/EBITDA/PBT/PAT, QoQ + YoY) + one FAST-tier line
- management_change → incoming/outgoing exec bio via FAST tier (push-side enrichment,
  explicitly allowed by the brief: professional background, not company analysis)
- everything else → one-liner only when it earns attention, else nothing
"""
from __future__ import annotations

import json
import logging

from .. import db
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
            "source": cut.get("source", "unknown"),
            "is_illustrative": cut.get("is_illustrative", False),
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
        qualifier = (
            "These are explicitly illustrative demo values; label them illustrative. "
            if facts.get("is_illustrative")
            else ""
        )
        fact_note = ("\nComputed facts (use these exact numbers, do not invent any): "
                     + qualifier
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
        clean = routing.strip_think(raw).strip()
        if clean:
            return clean.splitlines()[0][:200]
    except Exception as exc:
        log.warning("one-liner failed: %s", exc)
    return _deterministic_summary(filing, facts)


def _deterministic_summary(filing: dict, facts: dict | None) -> str:
    """Truthful fallback built only from source text or pre-computed metrics."""
    if facts:
        revenue = next(
            (row for row in facts.get("rows", []) if row.get("label") == "Revenue"),
            None,
        )
        if revenue and revenue.get("value") is not None:
            prefix = "Illustrative snapshot · " if facts.get("is_illustrative") else ""
            parts = [
                f"{prefix}{facts.get('period', 'Latest period')}: "
                f"Revenue {_format_number(revenue['value'])}"
            ]
            for key, label in (("qoq_pct", "QoQ"), ("yoy_pct", "YoY")):
                change = revenue.get(key)
                if change is not None:
                    direction = "up" if change >= 0 else "down"
                    parts.append(f"{direction} {abs(change):g}% {label}")
            return "; ".join(parts)[:200]

    headline = routing.strip_think(str(filing.get("headline") or "")).strip()
    if headline:
        return headline.splitlines()[0][:140]
    return "Corporate filing received; a reliable summary is unavailable."


def public_line(text: str, fallback: str = "") -> str:
    """Keep a stored sentence only when it is not model scratch text."""
    cleaned = routing.strip_think(text or "").strip()
    if not cleaned:
        cleaned = routing.strip_think(fallback or "").strip()
    if not cleaned:
        return "Corporate filing received; a reliable summary is unavailable."
    return cleaned.splitlines()[0][:200]


def sanitize_stored_narratives() -> int:
    """Replace already-saved scratch summaries so a rerun cannot keep them on screen."""
    changed = 0
    with db.db() as conn:
        for row in conn.execute("SELECT id, payload FROM alerts"):
            try:
                payload = json.loads(row["payload"])
            except (TypeError, json.JSONDecodeError):
                continue
            if not isinstance(payload, dict):
                continue
            dirty = False
            summary = payload.get("summary")
            if isinstance(summary, str):
                fixed = public_line(summary, str(payload.get("headline") or ""))
                if fixed != summary:
                    payload["summary"] = fixed
                    dirty = True
            bio = payload.get("bio")
            if isinstance(bio, dict):
                background = str(bio.get("background") or "")
                if background and not routing.strip_think(background).strip():
                    payload.pop("bio", None)
                    dirty = True
            if dirty:
                conn.execute(
                    "UPDATE alerts SET payload=? WHERE id=?",
                    (json.dumps(payload), row["id"]),
                )
                changed += 1

        for row in conn.execute("SELECT id, rendered FROM digests"):
            try:
                rendered = json.loads(row["rendered"])
            except (TypeError, json.JSONDecodeError):
                continue
            if not isinstance(rendered, dict):
                continue
            dirty = False
            for item in rendered.get("items") or []:
                if not isinstance(item, dict):
                    continue
                line = item.get("one_liner")
                if not isinstance(line, str):
                    continue
                fixed = public_line(line, str(item.get("headline") or ""))
                if fixed != line:
                    item["one_liner"] = fixed
                    dirty = True
            if dirty:
                conn.execute(
                    "UPDATE digests SET rendered=? WHERE id=?",
                    (json.dumps(rendered), row["id"]),
                )
                changed += 1
    return changed


def _format_number(value: int | float) -> str:
    if isinstance(value, float) and not value.is_integer():
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    return f"{value:,.0f}"


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
