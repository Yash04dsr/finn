"""FastAPI app: ADK chat (SSE), feed, digest, company, settings, costs, push, demo.

The chat endpoint streams ADK Runner events over SSE so the PWA shows tokens
and tool activity live.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google.adk import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types

from .. import db
from ..agent import build_finn_agent
from ..alerts import engine
from ..alerts.push import get_public_key
from ..config import ADHOC, PORTFOLIO
from ..ingest import prices as prices_ingest
from ..llm import routing
from ..pipeline import run_pipeline
from ..scheduler import start_scheduler, stop_scheduler
from ..tools import portfolio as portfolio_tools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("finn.api")

app = FastAPI(title="FINN", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_runner: Runner | None = None


def get_runner() -> Runner:
    global _runner
    if _runner is None:
        routing.ensure_llm_env()
        _runner = Runner(
            app_name="finn",
            agent=build_finn_agent(),
            session_service=DatabaseSessionService(db_url=f"sqlite+aiosqlite:///{db.DB_PATH}"),
            auto_create_session=True,
        )
    return _runner


@app.on_event("startup")
async def startup() -> None:
    db._get_conn()
    db.ensure_fts()
    start_scheduler()


@app.on_event("shutdown")
async def shutdown() -> None:
    stop_scheduler()


# --- feed ---------------------------------------------------------------------------

@app.get("/api/feed")
async def api_feed(hours: int = 24, include_read: bool = False):
    alerts = db.feed(include_read=include_read)
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    alerts = [a for a in alerts if (a["created_at"] or "") >= cutoff or include_read]
    return {"alerts": alerts}


@app.get("/api/digest/latest")
async def api_digest_latest():
    d = db.latest_digest()
    if not d:
        raise HTTPException(404, "no digest yet — run the demo pipeline")
    return d


# --- chat (ADK over SSE) -------------------------------------------------------------

@app.post("/api/chat")
async def api_chat(body: dict):
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "message required")
    session_id = body.get("session_id") or f"web-{datetime.now(timezone.utc).timestamp()}"
    ticker = body.get("ticker")
    if ticker:
        message = f"[About {ticker}] {message}"

    user_id = "investor"

    async def event_stream():
        try:
            # ensure session exists
            session = await get_runner().session_service.get_session(
                app_name="finn", user_id=user_id, session_id=session_id)
            if session is None:
                await get_runner().session_service.create_session(
                    app_name="finn", user_id=user_id, session_id=session_id)

            content = types.Content(role="user", parts=[types.Part(text=message)])
            final_text = ""
            usage_seen = None
            async for event in get_runner().run_async(
                user_id=user_id, session_id=session_id, new_message=content,
            ):
                # tool activity events
                if getattr(event, "tool_name", None) or (event.actions and event.actions.transfer_to_agent):
                    target = getattr(event.actions, "transfer_to_agent", None) if event.actions else None
                    yield sse({"type": "tool", "tool_name": target or getattr(event, "tool_name", ""),
                               "done": False})
                if event.content and event.content.parts:
                    is_final = event.is_final_response()
                    for part in event.content.parts:
                        if part.text:
                            if not is_final:
                                # Intermediate model text (pre-tool reasoning etc.)
                                yield sse({"type": "thinking", "content": part.text})
                            else:
                                final_text = part.text
                                yield sse({"type": "model", "content": part.text})
                # capture token usage for the cost ledger
                if event.usage_metadata:
                    usage_seen = event.usage_metadata
            if usage_seen:
                routing.record_usage("research", "fast", usage_seen)
            yield sse({"type": "final", "content": final_text, "done": True,
                       "session_id": session_id})
        except Exception as exc:
            log.exception("chat failed")
            yield sse({"type": "error", "content": str(exc), "done": True})

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


_last_usage: dict = {}  # reserved for future per-invocation usage capture


def sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


# --- companies -----------------------------------------------------------------------

@app.get("/api/companies")
async def api_companies():
    return {"portfolio": portfolio_tools.portfolio_snapshot(),
            "adhoc": portfolio_tools.adhoc_snapshot()}


@app.get("/api/company/{ticker}")
async def api_company(ticker: str):
    ticker = ticker.upper()
    all_t = PORTFOLIO + ADHOC
    if ticker not in all_t:
        raise HTTPException(404, f"{ticker} not tracked")
    from ..tools import metrics as metrics_mod
    from ..tools import guidance as guidance_mod
    from ..tools import portfolio as pf  # noqa: F401 (median peers)

    snap = prices_ingest.price_snapshot(ticker)
    quarterly = db.quarterly_series(ticker, limit=8)
    filings = db.recent_filings(ticker, limit=8)
    chunk_stats = {
        "transcripts": db.chunk_count(ticker, "transcript"),
        "annual_reports": db.chunk_count(ticker, "annual_report"),
        "results": db.chunk_count(ticker, "results_filing"),
    }
    # Guidance scorecard + portfolio-relative context for the company page.
    scorecard = guidance_mod.scorecard(ticker)
    peer_yoy = []
    for t in PORTFOLIO:
        if t == ticker:
            continue
        s = db.quarterly_series(t, limit=8)
        if len(s) >= 5:
            g = guidance_mod._yoy_growth(s, s[-1]["period"])
            if g is not None:
                peer_yoy.append(g)
    peer_yoy.sort()
    median_yoy = peer_yoy[len(peer_yoy) // 2] if peer_yoy else None
    latest = quarterly[-1] if quarterly else None
    yoy = None
    if latest and len(quarterly) >= 5:
        yq = latest["period"][:2]
        year_ago = next((r for r in quarterly if r["period"][:2] == yq and r["period"] != latest["period"]), None)
        if year_ago and year_ago.get("revenue") and latest.get("revenue"):
            yoy = round((latest["revenue"] - year_ago["revenue"]) / year_ago["revenue"] * 100, 1)
    return {
        "ticker": ticker,
        "snapshot": snap,
        "quarterly": quarterly,
        "filings": [{"id": f["id"], "category": f["category"], "headline": f["headline"],
                     "filed_at": f["filed_at"]} for f in filings],
        "chunk_stats": chunk_stats,
        "guidance_scorecard": scorecard,
        "portfolio_context": {"revenue_yoy": yoy, "portfolio_median_yoy": median_yoy},
    }


# --- settings -------------------------------------------------------------------------

@app.get("/api/settings")
async def api_settings_get():
    return engine.get_thresholds()


@app.post("/api/settings")
async def api_settings_post(body: dict):
    return engine.set_thresholds(body)


# --- costs -----------------------------------------------------------------------------

@app.get("/api/costs")
async def api_costs():
    return db.cost_summary()


# --- push --------------------------------------------------------------------------------

@app.get("/api/push/key")
async def api_push_key():
    return {"public_key": get_public_key()}


@app.post("/api/push/subscribe")
async def api_push_subscribe(body: dict):
    db.set_setting("push_subscription", json.dumps(body))
    return {"ok": True}


@app.post("/api/push/subscribe-expo")
async def api_push_subscribe_expo(body: dict):
    """Register an Expo push token (mobile app). Stored for the digest push."""
    token = (body or {}).get("token", "")
    if not token:
        raise HTTPException(400, "token required")
    db.set_setting("expo_push_token", token)
    return {"ok": True}


# --- demo pipeline --------------------------------------------------------------------------

@app.post("/api/demo/run")
async def api_demo_run():
    try:
        stats = await run_pipeline(hours=24, push=True)
        return stats
    except Exception as exc:
        log.exception("demo run failed")
        raise HTTPException(500, str(exc)) from exc
