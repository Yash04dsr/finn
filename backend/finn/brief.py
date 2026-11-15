"""The investor's two-minute brief: material items to decide on, tied to watchpoints.

Everything here is deterministic. Watchpoints are drafted from the Promise ledger
(management's own numeric commitments) and can be edited by the investor.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from . import db
from .alerts import engine

VERDICTS = {"no_impact", "watch", "changes_story"}

# Promise kinds a results filing can test, in the order a promise check prefers them.
LABELS = {"ebitda_margin": "EBITDA margin", "ebit_margin": "EBIT margin",
          "revenue_growth": "Revenue growth", "pat_margin": "Net margin"}
_BAND = re.compile(r"(-?\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*(-?\d+(?:\.\d+)?))?\s*%")
_CALL = re.compile(r"on the (Q[1-4]FY\d{2}) call")

# What a filing category most plausibly tests in a long-term holding.
CATEGORY_TESTS = {
    "results": "Delivery against guidance",
    "management_change": "Leadership continuity",
    "M&A": "Capital allocation",
    "fund_raise": "Capital allocation",
    "capex": "Capital allocation",
    "litigation": "Regulatory and legal risk",
    "pledging": "Promoter alignment",
    "insider_trading": "Promoter alignment",
    "credit_rating": "Balance sheet strength",
    "dividend": "Cash returns",
}


# --- watchpoints ---------------------------------------------------------------------------

def watchpoints(ticker: str) -> list[dict]:
    with db.db() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM watchpoints WHERE ticker=? ORDER BY origin DESC, id", (ticker,))]


def add_watchpoint(ticker: str, text: str, kind: str = "", lo=None, hi=None,
                   source_chunk=None, origin: str = "investor") -> dict:
    with db.db() as c:
        cur = c.execute(
            "INSERT INTO watchpoints(ticker, text, kind, lo, hi, source_chunk, origin) VALUES(?,?,?,?,?,?,?)",
            (ticker, text.strip()[:160], kind, lo, hi, source_chunk, origin))
        row = c.execute("SELECT * FROM watchpoints WHERE id=?", (cur.lastrowid,)).fetchone()
    return dict(row)


def delete_watchpoint(ticker: str, wp_id: int) -> None:
    with db.db() as c:
        c.execute("DELETE FROM watchpoints WHERE ticker=? AND id=?", (ticker, wp_id))


def draft_from_ledger(ticker: str, ledger: dict) -> list[dict]:
    """Turn management's checkable promises into up to four watchpoints, once."""
    if watchpoints(ticker):
        return watchpoints(ticker)
    drafted, seen = [], set()
    rows = sorted(ledger.get("rows", []), key=lambda r: [-x for x in _pk(r["period"])])
    from .tools.ledger import long_horizon
    for r in rows:
        lo, hi = _row_bounds(r)
        if (r["kind"] not in LABELS or r["kind"] in seen or lo is None or not r.get("company_level", True)
                or long_horizon(r.get("horizon"))):
            continue
        seen.add(r["kind"])
        src = r.get("promise_source") or {}
        text = f"{LABELS[r['kind']]} {r['band']}, as guided on the {r['period']} call"
        chunk = int(src["source_id"][1:]) if src.get("source_id") else None
        drafted.append(add_watchpoint(ticker, text, r["kind"], lo, hi, chunk, "drafted"))
        if len(drafted) >= 4:
            break
    return drafted


async def draft_for_results(alerts: list[dict]) -> None:
    """Grade the calls behind each results alert once, so its promise check has guidance."""
    from .tools.ledger import build_ledger
    for ticker in sorted({a["ticker"] for a in alerts if (a.get("payload") or {}).get("category") == "results"}):
        draft_from_ledger(ticker, await build_ledger(ticker))


def backfill_bounds() -> int:
    """Store numeric bounds on drafted watchpoints saved with the band only as text."""
    with db.db() as c:
        rows = c.execute("SELECT id, text FROM watchpoints WHERE origin='drafted' AND lo IS NULL").fetchall()
        filled = 0
        for r in rows:
            lo, hi = _parse_band(r["text"])
            if lo is not None:
                c.execute("UPDATE watchpoints SET lo=?, hi=? WHERE id=?", (lo, hi, r["id"]))
                filled += 1
    return filled


def prune_ungradable_watchpoints() -> int:
    """Drop drafted watchpoints whose only source is segment-level or long-term guidance,
    saved by builds that graded those against company-wide quarters."""
    from .tools.ledger import EXTRACT_VERSION, checkable_now
    removed = 0
    with db.db() as c:
        for w in c.execute("SELECT id, kind, source_chunk FROM watchpoints WHERE origin='drafted'"
                           " AND source_chunk IS NOT NULL").fetchall():
            claims = [dict(r) for r in c.execute(
                "SELECT metric, quote, horizon FROM guidance_claims WHERE chunk_id=? AND kind=? AND version=?",
                (w["source_chunk"], w["kind"], EXTRACT_VERSION))]
            if claims and not any(checkable_now(cl) for cl in claims):
                c.execute("DELETE FROM watchpoints WHERE id=?", (w["id"],))
                removed += 1
    return removed


def _row_bounds(row: dict) -> tuple[float | None, float | None]:
    if row.get("unit") not in (None, "%"):
        return None, None
    if row.get("lo") is not None:
        return row["lo"], row["hi"] if row.get("hi") is not None else row["lo"]
    return _parse_band(row.get("band") or "")


def _parse_band(text: str) -> tuple[float | None, float | None]:
    m = _BAND.search(text)
    if not m:
        return None, None
    lo = float(m.group(1))
    return lo, float(m.group(2)) if m.group(2) else lo


def _pk(period: str) -> tuple[int, int]:
    from .tools.ledger import period_key
    return period_key(period)


def _show_period(period: str | None) -> str:
    m = re.fullmatch(r"(Q[1-4])(FY\d{2})", period or "")
    return f"{m.group(1)} {m.group(2)}" if m else (period or "")


def touches(alert: dict, points: list[dict], check: dict | None = None) -> str:
    """The watchpoint or thesis area an alert bears on, in plain words."""
    p = alert.get("payload") or {}
    category = p.get("category") or alert["kind"]
    if check and check.get("guided_band"):
        return f"{check['metric']} {check['guided_band']}, as guided on the {check['guided_period']} call"
    if category == "results" or alert["kind"] == "price_move":
        graded = [w for w in points if w["kind"] in ("ebit_margin", "ebitda_margin", "revenue_growth")]
        if graded:
            return graded[0]["text"]
    if alert["kind"] == "volume_spike":
        return "Unusual trading: check for news you have not read"
    return CATEGORY_TESTS.get(category, "General disclosure")


# --- promise check -----------------------------------------------------------------------

def promise_check(alert: dict, points: list[dict]) -> dict | None:
    """Results only: management's earlier guided band against the number this filing reports.

    Plain arithmetic on stored figures; both sides cite their source. None for other alerts.
    """
    p = alert.get("payload") or {}
    if p.get("category") != "results" or engine.is_advance_notice(p.get("headline") or ""):
        return None
    facts = p.get("facts") or {}
    period = facts.get("period")
    # A sample-day filing is a stand-in event; its numbers are only illustrative when the
    # stored quarter itself is. Real reported numbers against real guidance are graded as such.
    illustrative = bool(facts.get("is_illustrative"))
    options = []
    for kind in LABELS:
        guided = _guidance(alert["ticker"], kind, period, points)
        delivered = _delivered(alert["ticker"], kind, facts) if facts else None
        rank = (guided is not None) * 2 + (delivered is not None)
        # Without guidance, revenue growth is the one reported number that reads the same for every business.
        options.append(((rank, rank == 1 and kind == "revenue_growth"), kind, guided, delivered))
    _, kind, guided, delivered = max(options, key=lambda o: o[0])
    label = LABELS[kind]
    band = _show_band(guided["lo"], guided["hi"]) if guided else ""
    gp, dp = _show_period(guided["period"]) if guided else "", _show_period(period) if facts else None
    if guided and delivered is not None:
        status = "missed" if delivered < guided["lo"] else "kept"
        note = f"{label} {delivered:g}% in {dp} against {band} guided on the {gp} call."
    elif guided:
        status = "not_reported"
        note = f"{label} of {band} was guided on the {gp} call, but this filing does not report enough to check it."
    elif delivered is not None:
        status = "no_guidance"
        note = f"{label} {delivered:g}% in {dp}; management gave no numeric guidance on it on recent calls."
    else:
        status = "no_guidance"
        note = "No numeric guidance on recent calls to check these results against."
    if illustrative:
        note = "Illustrative sample: " + note
    return {
        "metric": label,
        "guided_band": band,
        "guided_lo": guided["lo"] if guided else None,
        "guided_hi": guided["hi"] if guided else None,
        "guided_period": gp,
        "guided_source": _guided_source(guided) if guided else None,
        "delivered": delivered,
        "delivered_period": dp if delivered is not None else None,
        "delivered_source": _results_source(alert["ticker"], p, period) if delivered is not None else None,
        "status": status,
        "note": note,
        "is_illustrative": illustrative,
        "is_sample_filing": bool(p.get("is_sample")),
        "numbers_source": _numbers_source(facts) if delivered is not None else None,
    }


def _numbers_source(facts: dict) -> str:
    return {"screener_live": "Screener quarterly table, compiled from exchange filings",
            "illustrative_snapshot": "Illustrative snapshot"}.get(facts.get("source") or "", "Stored quarterly table")


def _guidance(ticker: str, kind: str, before: str | None, points: list[dict]) -> dict | None:
    """The newest numeric band for this metric guided on a call before the reported quarter."""
    from .tools.ledger import EXTRACT_VERSION, checkable_now
    with db.db() as c:
        claims = [dict(r) for r in c.execute(
            "SELECT period, lo, hi, chunk_id, quote, metric, horizon FROM guidance_claims WHERE ticker=? AND kind=?"
            " AND unit='%' AND lo IS NOT NULL AND version=?", (ticker, kind, EXTRACT_VERSION))]
    whole = [r for r in claims if checkable_now(r)]
    segment_only = {r["chunk_id"] for r in claims} - {r["chunk_id"] for r in whole}
    found = []
    for w in points:
        lo, hi = (w["lo"], w["hi"]) if w.get("lo") is not None else _parse_band(w.get("text") or "")
        m = _CALL.search(w.get("text") or "")
        if w.get("origin") == "drafted" and w.get("source_chunk") in segment_only:
            continue
        if w.get("kind") == kind and lo is not None and m:
            found.append({"period": m.group(1), "lo": lo, "hi": hi if hi is not None else lo,
                          "chunk": w.get("source_chunk"), "quote": None, "kind": kind})
    for r in whole:
        found.append({"period": r["period"], "lo": r["lo"], "hi": r["hi"] if r["hi"] is not None else r["lo"],
                      "chunk": r["chunk_id"], "quote": r["quote"], "kind": kind})
    found = [g for g in found if _pk(g["period"]) != (0, 0)
             and (not before or _pk(g["period"]) < _pk(before))]
    # Same call either way; the claim carries management's exact words.
    return max(found, key=lambda g: (_pk(g["period"]), g["quote"] is not None)) if found else None


def _delivered(ticker: str, kind: str, facts: dict) -> float | None:
    rows = {r.get("label"): r for r in facts.get("rows") or []}
    revenue = (rows.get("Revenue") or {}).get("value")
    if kind == "revenue_growth":
        return (rows.get("Revenue") or {}).get("yoy_pct")
    part = {"ebitda_margin": "EBITDA", "pat_margin": "PAT"}.get(kind)
    if part:
        value = (rows.get(part) or {}).get("value")
        return round(value / revenue * 100, 1) if value is not None and revenue else None
    if (rows.get("EBITDA") or {}).get("value") is None:
        return None
    from .tools.ledger import _delivered as from_series
    return from_series(kind, db.quarterly_series(ticker, limit=12), facts.get("period"))


def _show_band(lo: float, hi: float) -> str:
    return f"{lo:g}%" if hi == lo else f"{lo:g}-{hi:g}%"


def _guided_source(guided: dict) -> dict | None:
    if not guided.get("chunk"):
        return None
    with db.db() as c:
        chunk = c.execute("SELECT id, doc_title, url, text FROM chunks WHERE id=?", (guided["chunk"],)).fetchone()
        quote = guided["quote"] or (c.execute(
            "SELECT quote FROM guidance_claims WHERE chunk_id=? AND kind=? AND quote<>'' ORDER BY id DESC LIMIT 1",
            (guided["chunk"], guided.get("kind") or "")).fetchone() or {"quote": None})["quote"]
    if not chunk:
        return None
    return {"source_id": f"S{chunk['id']}", "title": chunk["doc_title"], "url": chunk["url"],
            "excerpt": quote or chunk["text"][:240]}


def _results_source(ticker: str, payload: dict, period: str | None) -> dict:
    if payload.get("filing_url"):
        return {"title": payload.get("headline") or "Results filing", "url": payload["filing_url"]}
    with db.db() as c:
        row = c.execute("SELECT doc_title, url FROM chunks WHERE ticker=? AND doc_type='results_filing'"
                        " AND period=? LIMIT 1", (ticker, period)).fetchone()
    if row:
        return {"title": row["doc_title"], "url": row["url"]}
    return {"title": payload.get("headline") or "Results filing", "url": None}


# --- verdicts and the brief --------------------------------------------------------------

def set_verdict(alert_id: int, verdict: str, note: str = "", mute_category: bool = False) -> dict:
    if verdict not in VERDICTS:
        raise ValueError("unknown verdict")
    alert = db.get_alert(alert_id)
    if not alert:
        raise LookupError("alert not found")
    with db.db() as c:
        c.execute("INSERT OR REPLACE INTO verdicts(alert_id, ticker, verdict, note) VALUES(?,?,?,?)",
                  (alert_id, alert["ticker"], verdict, note[:300]))
        c.execute("UPDATE alerts SET read=1 WHERE id=?", (alert_id,))
    muted = None
    category = (alert["payload"] or {}).get("category")
    if mute_category and category:
        th = engine.get_thresholds()
        watched = [x for x in th.get("categories_watch", []) if x != category]
        engine.set_thresholds({"categories_watch": watched})
        engine.rescore_announcements()
        muted = category
    return {"alert_id": alert_id, "verdict": verdict, "muted_category": muted}


def verdict_log(limit: int = 30) -> list[dict]:
    with db.db() as c:
        rows = c.execute(
            "SELECT v.*, a.kind, a.payload FROM verdicts v JOIN alerts a ON a.id = v.alert_id"
            " ORDER BY v.created_at DESC LIMIT ?", (limit,)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        p = json.loads(d.pop("payload"))
        d["headline"] = p.get("headline") or d["kind"].replace("_", " ")
        out.append(d)
    return out


def _past_verdict(ticker: str, category: str | None) -> dict | None:
    """The investor's last call on a similar item, as a memory aid."""
    if not category:
        return None
    with db.db() as c:
        row = c.execute(
            "SELECT v.verdict, v.created_at FROM verdicts v JOIN alerts a ON a.id=v.alert_id"
            " WHERE v.ticker=? AND json_extract(a.payload,'$.category')=? ORDER BY v.created_at DESC LIMIT 1",
            (ticker, category)).fetchone()
    return dict(row) if row else None


def mark_seen() -> str:
    now = datetime.now(timezone.utc).isoformat()
    db.set_setting("brief_last_look", now)
    return now


def brief(hours: int = 24) -> dict:
    """Material items still waiting for a verdict, plus what was filtered out and why."""
    alerts = db.feed(since_hours=hours, include_read=True)
    with db.db() as c:
        decided = {r["alert_id"]: r["verdict"] for r in c.execute("SELECT alert_id, verdict FROM verdicts")}
    last_look = db.get_setting("brief_last_look")
    points_cache: dict[str, list[dict]] = {}
    material, worth, background, routine, done = [], [], [], 0, []
    for a in alerts:
        if a["priority"] >= 4:
            routine += 1
            continue
        points = points_cache.setdefault(a["ticker"], watchpoints(a["ticker"]))
        p = a.get("payload") or {}
        check = promise_check(a, points)
        item = {
            **a,
            "touches": touches(a, points, check),
            "promise_check": check,
            "is_new": bool(last_look and (a.get("event_at") or "") > last_look),
            "past_verdict": _past_verdict(a["ticker"], p.get("category")),
            "verdict": decided.get(a["id"]),
        }
        if item["verdict"]:
            done.append(item)
        elif a["priority"] <= 1:
            material.append(item)
        elif a["priority"] == 2:
            worth.append(item)
        else:
            background.append(item)
    # Results that kept or broke a promise are the decisions the brief exists for, so they lead.
    material.sort(key=lambda i: (i["promise_check"] or {}).get("status") not in ("kept", "missed"))
    return {
        "hours": hours,
        "last_look": last_look,
        "new_since_last_look": sum(1 for i in material + worth + background if i["is_new"]),
        "material": material,
        "worth_a_look": worth,
        "background": background,
        "done": done,
        "routine_count": routine,
        "is_sample": any((a.get("payload") or {}).get("is_sample") for a in alerts),
    }
