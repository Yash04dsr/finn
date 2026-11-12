"""FastAPI app: ADK chat (SSE), feed, digest, company, settings, costs, push, demo.

The chat endpoint streams ADK Runner events over SSE so the PWA shows tokens
and tool activity live.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from google.adk import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types

from .. import db
from ..agent import build_finn_agent
from ..alerts import engine
from ..alerts.push import get_public_key
from ..config import (
    ADHOC,
    ALLOWED_ORIGINS,
    CHAT_RATE_PER_MINUTE,
    DEMO_RUN_RATE_PER_HOUR,
    MUTATION_RATE_PER_MINUTE,
    PORTFOLIO,
)
from ..ingest import prices as prices_ingest
from ..llm import routing
from ..pipeline import run_pipeline
from ..scheduler import start_scheduler, stop_scheduler
from ..tools import portfolio as portfolio_tools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("finn.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db._get_conn()
    db.ensure_fts()
    from ..alerts.enrichers import sanitize_stored_narratives
    sanitize_stored_narratives()
    primary_chunks = sum(
        db.chunk_count(doc_type=kind)
        for kind in ("transcript", "annual_report", "results_filing")
    )
    if (
        primary_chunks == 0
        and os.getenv("FINN_TEST_DB") != "1"
        and os.getenv("FINN_AUTO_INGEST_OFFICIAL", "1") == "1"
    ):
        from ..ingest.official_docs import seed_official_documents
        await asyncio.to_thread(seed_official_documents)
    if db.chunk_count() == 0:
        from ..ingest.seed_docs import seed_all
        seed_all()
    scheduler_enabled = os.getenv("VERCEL") != "1"
    if scheduler_enabled:
        start_scheduler()
    try:
        yield
    finally:
        if scheduler_enabled:
            stop_scheduler()


app = FastAPI(title="FINN", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Finn-Demo-Key"],
)

_runner: Runner | None = None
_rate_buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)


@app.middleware("http")
async def public_demo_limits(request: Request, call_next):
    """Conservative in-memory limits for the public, single-process demo."""
    if request.method != "POST":
        return await call_next(request)
    path = request.url.path
    if path == "/api/chat":
        bucket_name, limit, window_s = "chat", CHAT_RATE_PER_MINUTE, 60
    elif path == "/api/demo/run":
        bucket_name, limit, window_s = "demo", DEMO_RUN_RATE_PER_HOUR, 3600
    else:
        bucket_name, limit, window_s = "mutation", MUTATION_RATE_PER_MINUTE, 60
    client = request.client.host if request.client else "unknown"
    key = (client, bucket_name)
    now = time.monotonic()
    bucket = _rate_buckets[key]
    while bucket and bucket[0] <= now - window_s:
        bucket.popleft()
    if len(bucket) >= limit:
        retry_after = max(1, int(window_s - (now - bucket[0])))
        return JSONResponse(
            {"detail": "Rate limit reached. Please wait and retry."},
            status_code=429,
            headers={"Retry-After": str(retry_after)},
        )
    bucket.append(now)
    return await call_next(request)


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


@app.get("/healthz")
async def healthz():
    primary_chunks = sum(
        db.chunk_count(doc_type=kind)
        for kind in ("transcript", "annual_report", "results_filing")
    )
    return {
        "ok": True,
        "database": "ready",
        "research_chunks": primary_chunks,
        "research_ready": primary_chunks > 0,
    }


# --- feed ---------------------------------------------------------------------------

@app.get("/api/feed")
async def api_feed(hours: int = 24, include_read: bool = False):
    alerts = db.feed(include_read=include_read)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max(1, min(hours, 24 * 30)))
    alerts = [
        a for a in alerts
        if include_read or _parse_db_time(a.get("created_at")) >= cutoff
    ]
    return {"alerts": alerts}


def _parse_db_time(raw: str | None) -> datetime:
    if not raw:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(raw.replace(" ", "T"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


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
    if len(message) > 4000:
        raise HTTPException(400, "message must be 4000 characters or fewer")
    session_id = str(body.get("session_id") or f"web-{datetime.now(timezone.utc).timestamp()}")
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,120}", session_id):
        raise HTTPException(400, "invalid session_id")
    ticker = body.get("ticker")
    if ticker:
        ticker = _normalize_ticker(str(ticker))
        message = f"[About {ticker}] {message}"

    # Isolate ADK history per client session; the prior global investor identity
    # allowed unrelated public-demo users to share context.
    user_id = f"investor-{hashlib.sha256(session_id.encode()).hexdigest()[:16]}"

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
            usage_events: set[tuple] = set()
            used_research = False
            async for event in get_runner().run_async(
                user_id=user_id, session_id=session_id, new_message=content,
            ):
                # tool activity events
                if getattr(event, "tool_name", None) or (event.actions and event.actions.transfer_to_agent):
                    target = getattr(event.actions, "transfer_to_agent", None) if event.actions else None
                    if target and "research_analyst" in str(target):
                        used_research = True
                    yield sse({"type": "tool", "tool_name": target or getattr(event, "tool_name", ""),
                               "done": False})
                if event.content and event.content.parts:
                    is_final = event.is_final_response()
                    for part in event.content.parts:
                        if part.text:
                            if is_final:
                                final_text = part.text
                # Record each model event once. Intermediate text is deliberately
                # not exposed; it may contain provider reasoning or prompt traces.
                if event.usage_metadata:
                    author = str(getattr(event, "author", "") or "")
                    tier = (
                        routing.Tier.REASONING
                        if "research_analyst" in author
                        else routing.Tier.FAST
                    )
                    used_research = used_research or tier == routing.Tier.REASONING
                    usage = event.usage_metadata
                    usage_key = (
                        getattr(event, "id", None),
                        author,
                        getattr(usage, "prompt_token_count", None),
                        getattr(usage, "candidates_token_count", None),
                        getattr(usage, "total_token_count", None),
                    )
                    if usage_key not in usage_events:
                        usage_events.add(usage_key)
                        routing.record_usage(
                            "research" if tier == routing.Tier.REASONING else "chat",
                            tier,
                            usage,
                        )
            refusal = "isn't covered in the available primary sources"
            if (
                used_research
                and final_text
                and not re.search(r"\[S\d+\]", final_text)
                and refusal not in final_text
            ):
                log.warning("uncited research response suppressed for session %s", session_id)
                final_text = (
                    "I couldn't verify that answer against the available cited sources. "
                    "Try narrowing the company, period, or filing."
                )
            if final_text:
                yield sse({"type": "model", "content": final_text})
            yield sse({"type": "final", "content": final_text, "done": True,
                       "session_id": session_id})
        except Exception:
            log.exception("chat failed")
            yield sse({
                "type": "error",
                "content": "FINN could not complete that request. Please retry.",
                "done": True,
            })

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
    ticker = _normalize_ticker(ticker)
    from ..tools import metrics as metrics_mod
    from ..tools import guidance as guidance_mod
    from ..tools import portfolio as pf  # noqa: F401 (median peers)

    snap = prices_ingest.price_snapshot(ticker)
    quarterly = db.quarterly_series(ticker, limit=8)
    if snap is None and not quarterly:
        await _hydrate_company(ticker)
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
        "tracked": ticker in (PORTFOLIO + ADHOC),
        "available": bool(snap or quarterly or filings or any(chunk_stats.values())),
        "snapshot": snap,
        "quarterly": quarterly,
        "filings": [{"id": f["id"], "category": f["category"], "headline": f["headline"],
                     "filed_at": f["filed_at"]} for f in filings],
        "chunk_stats": chunk_stats,
        "guidance_scorecard": scorecard,
        "portfolio_context": {"revenue_yoy": yoy, "portfolio_median_yoy": median_yoy},
    }


def _normalize_ticker(raw: str) -> str:
    ticker = raw.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&.-]{0,19}", ticker):
        raise HTTPException(400, "invalid NSE/BSE ticker")
    return ticker


async def _hydrate_company(ticker: str) -> None:
    """Best-effort on-demand hydration for grader-supplied NSE/BSE symbols."""
    from ..ingest.screener import ingest_quarterly

    def prices() -> None:
        for row in prices_ingest.fetch_eod(ticker, days=60):
            db.put_price(ticker, row["date"], row["close"], row["volume"])

    await asyncio.gather(
        asyncio.to_thread(prices),
        asyncio.to_thread(ingest_quarterly, ticker),
        return_exceptions=True,
    )


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
    if not isinstance(body, dict) or len(json.dumps(body)) > 8192:
        raise HTTPException(400, "invalid push subscription")
    if not isinstance(body.get("endpoint"), str) or not body["endpoint"].startswith("https://"):
        raise HTTPException(400, "invalid push endpoint")
    keys = body.get("keys")
    if not isinstance(keys, dict) or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(400, "push encryption keys required")
    db.set_setting("push_subscription", json.dumps(body))
    return {"ok": True}


@app.post("/api/push/subscribe-expo")
async def api_push_subscribe_expo(body: dict):
    """Register an Expo push token (mobile app). Stored for the digest push."""
    token = (body or {}).get("token", "")
    if not isinstance(token, str) or not re.fullmatch(
        r"Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]", token
    ):
        raise HTTPException(400, "valid Expo push token required")
    db.set_setting("expo_push_token", token)
    return {"ok": True}


# --- demo pipeline --------------------------------------------------------------------------

@app.post("/api/demo/run")
async def api_demo_run():
    try:
        stats = await run_pipeline(hours=24, push=True)
        return stats
    except Exception:
        log.exception("demo run failed")
        raise HTTPException(500, "Demo pipeline failed. Check server logs and retry.")
