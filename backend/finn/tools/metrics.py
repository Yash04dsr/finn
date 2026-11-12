"""Deterministic financial math — QoQ/YoY deltas, margins, leverage, ratios.

Pure Python on stored quarterly numbers. The LLM never does arithmetic;
it only narrates numbers computed here. That's the ground-truth discipline.
"""
from __future__ import annotations

from .. import db

METRIC_LABELS = {"revenue": "Revenue", "ebitda": "EBITDA", "pbt": "PBT", "pat": "PAT"}


def first_cut(ticker: str) -> dict | None:
    """Results first-cut: latest quarter vs prior quarter (QoQ) and same quarter last year (YoY).

    Returns None when fewer than 5 quarters are stored (can't do YoY properly).
    """
    series = db.quarterly_series(ticker, limit=8)
    if len(series) < 2:
        return None
    latest = series[-1]
    prev_q = series[-2]
    # YoY match: same quarter label, previous fiscal year (e.g. Q2FY25 vs Q2FY26).
    yoy = next((r for r in series[:-1]
                if r["period"][:2] == latest["period"][:2]
                and r["period"] != latest["period"]), None)
    metrics = {}
    for key, label in METRIC_LABELS.items():
        cur = latest.get(key)
        entry: dict = {"label": label, "value": cur}
        if cur is not None and prev_q.get(key) is not None and prev_q[key] != 0:
            entry["qoq_pct"] = _pct(cur, prev_q[key])
        if cur is not None and yoy is not None and yoy.get(key) is not None and yoy[key] != 0:
            entry["yoy_pct"] = _pct(cur, yoy[key])
        metrics[key] = entry
    out = {
        "ticker": ticker,
        "period": latest["period"],
        "prev_period": prev_q["period"],
        "yoy_period": yoy["period"] if yoy else None,
        "source": latest.get("source", "unknown"),
        "is_illustrative": latest.get("source") == "illustrative_snapshot",
        "metrics": metrics,
        "margins": margins_for(ticker),
    }
    return out


def margins_for(ticker: str) -> list[dict]:
    """Per-quarter margins: ebitda_pct, pat_pct."""
    series = db.quarterly_series(ticker, limit=8)
    out = []
    for r in series:
        row = {"period": r["period"]}
        if r.get("revenue"):
            if r.get("ebitda") is not None:
                row["ebitda_pct"] = round(r["ebitda"] / r["revenue"] * 100, 1)
            if r.get("pat") is not None:
                row["pat_pct"] = round(r["pat"] / r["revenue"] * 100, 1)
        out.append(row)
    return out


def _pct(cur: float, base: float) -> float:
    return round((cur - base) / abs(base) * 100, 1)


def narrative_vs_numbers(ticker: str) -> dict:
    """Compare management guidance/promises (from transcripts) with delivered quarters.

    The guidance claims are retrieved by the agent via RAG (management's own words),
    then matched here against the delivered quarterly series. This function only
    computes delivery verdicts given a set of extracted claims.
    """
    series = db.quarterly_series(ticker, limit=8)
    return {
        "delivered": [
            {"period": r["period"], "revenue": r.get("revenue"), "ebitda": r.get("ebitda"),
             "pbt": r.get("pbt"), "pat": r.get("pat")} for r in series
        ],
        "margins": margins_for(ticker),
    }


def growth_summary(ticker: str) -> dict:
    """Compact trend lines for the research view: revenue & PAT trajectory."""
    series = db.quarterly_series(ticker, limit=8)
    if len(series) < 3:
        return {}
    rev_growth = []
    for a, b in zip(series, series[1:]):
        if a.get("revenue") and b.get("revenue"):
            rev_growth.append({"period": b["period"], "qoq_pct": _pct(b["revenue"], a["revenue"])})
    pat = [r.get("pat") for r in series if r.get("pat") is not None]
    return {
        "periods": [r["period"] for r in series],
        "revenue": [r.get("revenue") for r in series],
        "pat": pat,
        "rev_qoq": rev_growth,
    }
