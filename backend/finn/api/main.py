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
from ..llm.chat_guard import out_of_scope_reply, plain_voice
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
    db.dedupe_alerts()
    from .. import brief as brief_mod
    brief_mod.backfill_bounds()
    brief_mod.prune_ungradable_watchpoints()
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
    if os.getenv("FINN_TEST_DB") != "1" and os.getenv("FINN_WARM_LEDGER", "1") == "1":
        asyncio.get_running_loop().create_task(_warm_sample_ledgers())
    try:
        yield
    finally:
        if scheduler_enabled:
            stop_scheduler()


async def _warm_sample_ledgers() -> None:
    """Read the recent calls behind each sample-day results filing and grade them, in the
    background, so the promise check has management's guidance when the sample day loads."""
    from .. import brief as brief_mod
    from ..ingest.discovery import ensure_research_docs
    from ..ingest.nse_feed import load_snapshot

    watched = set(portfolio_tools.watched_tickers())
    results = (r["ticker"] for r in load_snapshot()
               if r["category"] == "results" and not engine.is_advance_notice(r["headline"]))
    tickers = [t for t in dict.fromkeys(results) if t in watched]
    for ticker in tickers:
        try:
            await asyncio.to_thread(ensure_research_docs, ticker, 4, 90.0)
            await brief_mod.draft_for_results([{"ticker": ticker, "payload": {"category": "results"}}])
        except Exception:
            log.exception("ledger warm-up failed for %s", ticker)


app = FastAPI(title="FINN", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
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


_research_runner: Runner | None = None
_session_service: DatabaseSessionService | None = None
_last_ticker: dict[str, str] = {}

TOOL_LABELS = {
    "search_docs_wrapped": "Reading the filings",
    "quarterly_metrics": "Checking the numbers",
    "price_context_wrapped": "Checking the price",
    "doc_overview_wrapped": "Listing documents on file",
    "scorecard_wrapped": "Checking guidance against results",
    "promise_ledger": "Checking promises against results",
    "portfolio_overview": "Looking at your portfolio",
}


def _sessions() -> DatabaseSessionService:
    global _session_service
    if _session_service is None:
        _session_service = DatabaseSessionService(db_url=f"sqlite+aiosqlite:///{db.DB_PATH}")
    return _session_service


def get_runner() -> Runner:
    """Fast-tier assistant for portfolio-wide questions."""
    global _runner
    if _runner is None:
        routing.ensure_llm_env()
        _runner = Runner(app_name="finn", agent=build_finn_agent(),
                         session_service=_sessions(), auto_create_session=True)
    return _runner


def get_research_runner() -> Runner:
    """Reasoning-tier analyst for company questions, grounded in primary documents."""
    global _research_runner
    if _research_runner is None:
        from ..agents.research_analyst import build_research_analyst

        routing.ensure_llm_env()
        _research_runner = Runner(app_name="finn_research", agent=build_research_analyst(),
                                  session_service=_sessions(), auto_create_session=True)
    return _research_runner


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
    """Alerts whose underlying event falls inside the chosen window."""
    hours = max(1, min(hours, 24 * 30))
    return {"alerts": db.feed(since_hours=hours, include_read=include_read)}


def _parse_db_time(raw: str | None) -> datetime:
    if not raw:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(raw.replace(" ", "T"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


@app.get("/api/digest/latest")
async def api_digest_latest(hours: int = 24):
    """The brief for the chosen window, composed from the alerts in that window."""
    from ..alerts.digest import compose_from_alerts

    hours = max(1, min(hours, 24 * 30))
    alerts = db.feed(since_hours=hours, include_read=True)
    if not alerts:
        raise HTTPException(404, "nothing in this window yet")
    end = datetime.now(timezone.utc)
    return {
        "window_start": (end - timedelta(hours=hours)).isoformat(),
        "window_end": end.isoformat(),
        "rendered": compose_from_alerts(alerts, hours=hours),
    }


# --- chat (ADK over SSE) -------------------------------------------------------------

NOT_COVERED = "isn't covered in the available primary sources"


def _filing_context(filing_id) -> str:
    """Describe the exact alert the investor tapped, so the answer is about that filing."""
    try:
        alert = db.get_alert(int(filing_id))
    except (TypeError, ValueError):
        return ""
    if not alert:
        return ""
    p = alert["payload"] or {}
    if alert["kind"] == "announcement":
        return (f"[Filing the investor is asking about: {p.get('headline', '')}; "
                f"category {p.get('category', '')}; filed {str(p.get('filed_at', ''))[:10]}]")
    return (f"[Alert the investor is asking about: {alert['kind'].replace('_', ' ')} on "
            f"{str(p.get('date', ''))[:10]}, value {p.get('value')}, threshold {p.get('threshold')}]")


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

    refused = out_of_scope_reply(message)
    if refused:
        async def refused_stream():
            yield sse({"type": "model", "content": refused})
            yield sse({"type": "final", "content": refused, "done": True,
                       "session_id": session_id, "citations": []})

        return StreamingResponse(refused_stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    from ..llm.citations import collect_from_event, finalize
    from ..llm.intent import detect_ticker, route

    # Name resolution may ask Screener about a BSE-only symbol, so keep it off the event loop.
    named = ticker or await asyncio.to_thread(detect_ticker, message)
    lane, routed_ticker = route(message, named, _last_ticker.get(session_id))
    prompt = message
    if lane == "research":
        _last_ticker[session_id] = routed_ticker
        from ..ingest.symbols import company_name

        context = _filing_context(body.get("filing_id")) if body.get("filing_id") else ""
        listed_as = company_name(routed_ticker)
        about = f"{routed_ticker}, listed as {listed_as}" if listed_as else routed_ticker
        prompt = f"[About {about}] {context} {message}".replace("  ", " ")

    # Standalone company questions (not follow-ups, not about one filing) can reuse an answer
    # until new documents or numbers arrive for that company.
    cache_key = None
    if lane == "research" and not body.get("filing_id") and len(message.split()) >= 4 and named:
        norm = re.sub(r"[^a-z0-9 ]+", "", message.lower()).strip()
        cache_key = hashlib.sha256(
            f"{routed_ticker}|{norm}|{db.corpus_version(routed_ticker)}".encode()).hexdigest()
        hit = db.cache_get(cache_key)
        if hit:
            async def cached_stream():
                yield sse({"type": "route", "lane": lane, "ticker": routed_ticker})
                yield sse({"type": "model", "content": hit["content"]})
                yield sse({"type": "final", "content": hit["content"], "done": True, "session_id": session_id,
                           "citations": hit["citations"],
                           "receipt": {"lane": lane, "tier": "cache", "model": "cached answer",
                                       "prompt_tokens": 0, "completion_tokens": 0,
                                       "cached": True, "cost_usd": 0.0}})

            return StreamingResponse(cached_stream(), media_type="text/event-stream",
                                     headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
    runner = get_research_runner() if lane == "research" else get_runner()
    app_name = "finn_research" if lane == "research" else "finn"
    tier = routing.Tier.REASONING if lane == "research" else routing.Tier.FAST
    # Isolate ADK history per client session.
    user_id = f"investor-{hashlib.sha256(session_id.encode()).hexdigest()[:16]}"

    async def event_stream():
        try:
            yield sse({"type": "route", "lane": lane, "ticker": routed_ticker})
            if lane == "research" and routed_ticker not in _hydrated and db.chunk_count(routed_ticker):
                await _hydrate_company(routed_ticker, prices=False)
                _hydrated.add(routed_ticker)
            if lane == "research" and db.chunk_count(routed_ticker) == 0:
                from ..ingest.discovery import ensure_research_docs

                yield sse({"type": "tool", "tool_name": f"Fetching {routed_ticker}'s latest call transcript",
                           "done": False})
                if routed_ticker not in _hydrated:
                    await _hydrate_company(routed_ticker)
                    _hydrated.add(routed_ticker)
                await asyncio.to_thread(ensure_research_docs, routed_ticker, 1, 40.0)
                if db.chunk_count(routed_ticker):
                    _start_prepare(routed_ticker)
            session = await runner.session_service.get_session(
                app_name=app_name, user_id=user_id, session_id=session_id)
            if session is None:
                await runner.session_service.create_session(
                    app_name=app_name, user_id=user_id, session_id=session_id)

            content = types.Content(role="user", parts=[types.Part(text=prompt)])
            final_text = ""
            registry: dict[str, dict] = {}
            usage_events: set[tuple] = set()
            tokens = {"prompt": 0, "completion": 0}
            async for event in runner.run_async(user_id=user_id, session_id=session_id,
                                                new_message=content):
                for call in event.get_function_calls() or []:
                    yield sse({"type": "tool", "tool_name": TOOL_LABELS.get(call.name, "Working"),
                               "done": False})
                collect_from_event(event, registry)
                if event.content and event.content.parts and event.is_final_response():
                    texts = [part.text for part in event.content.parts if part.text]
                    if texts:
                        final_text = "\n".join(texts)
                # Record each model event once. Intermediate text is never exposed.
                if event.usage_metadata:
                    usage = event.usage_metadata
                    usage_key = (getattr(event, "id", None),
                                 getattr(usage, "prompt_token_count", None),
                                 getattr(usage, "candidates_token_count", None))
                    if usage_key not in usage_events:
                        usage_events.add(usage_key)
                        recorded = routing.record_usage(
                            "research" if lane == "research" else "chat", tier, usage)
                        tokens["prompt"] += recorded["prompt_tokens"]
                        tokens["completion"] += recorded["completion_tokens"]

            from ..llm.answer import rewrite_notes, tagged_answer, visible_answer

            # A research reply without the answer tag may mix working notes with the answer,
            # so the fast tier rewrites it; citations are validated afterwards either way.
            shown = tagged_answer(final_text) if lane == "research" else visible_answer(final_text)
            if final_text and not shown and lane == "research":
                yield sse({"type": "tool", "tool_name": "Writing the answer", "done": False})
                try:
                    shown = await rewrite_notes(final_text, message)
                except Exception:
                    log.exception("answer rewrite failed")
                    shown = visible_answer(final_text)
            if final_text and not shown:
                log.warning("reply held back: no clean answer in model output (session %s): %r",
                            session_id, final_text[-1200:])
                shown = "I couldn't put together a clear answer to that. Please ask again, a little more specifically."
            shown = re.sub(r"</?answer>", "", shown or "", flags=re.IGNORECASE).strip().lstrip(".,;: \n")
            text, citations, rejected = finalize(shown, registry)
            if rejected:
                log.warning("dropped citations not returned by tools: %s", rejected)
            if lane == "research" and not citations and NOT_COVERED in text:
                text = (f"This isn't covered in the available primary sources for {routed_ticker} "
                        "(annual reports, transcripts, results filings).")
            elif lane == "research" and text and not citations:
                log.warning("uncited research response suppressed for session %s; known=%s; text=%r",
                            session_id, sorted(registry)[:12], shown[:400])
                text = ("I couldn't check that answer against the company's filings, so I won't show it. "
                        "Try asking about a specific period, result, or guidance.")
            text = plain_voice(text)
            receipt = {"lane": lane, "tier": tier, "model": routing.model_for(tier),
                       "prompt_tokens": tokens["prompt"], "completion_tokens": tokens["completion"],
                       "cached": False,
                       "cost_usd": _chat_cost_usd(tier, tokens["prompt"], tokens["completion"])}
            if text:
                yield sse({"type": "model", "content": text})
            if cache_key and citations:
                db.cache_put(cache_key, routed_ticker, text, citations)
            yield sse({"type": "final", "content": text, "done": True, "session_id": session_id,
                       "citations": citations, "receipt": receipt})
        except Exception:
            log.exception("chat failed")
            yield sse({"type": "error", "content": "FINN could not complete that request. Please retry.",
                       "done": True})

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


_last_usage: dict = {}  # reserved for future per-invocation usage capture


def _chat_cost_usd(tier: str, prompt_tokens: int, completion_tokens: int) -> float | None:
    """Cost of one answer from per-million-token rates set in the environment.

    FINN_PRICE_<TIER>_IN / FINN_PRICE_<TIER>_OUT are USD per million tokens. Without them
    the cost is unknown and reported as None rather than guessed.
    """
    try:
        rate_in = float(os.environ[f"FINN_PRICE_{tier.upper()}_IN"])
        rate_out = float(os.environ[f"FINN_PRICE_{tier.upper()}_OUT"])
    except (KeyError, ValueError):
        return None
    return round((prompt_tokens * rate_in + completion_tokens * rate_out) / 1_000_000, 6)


def sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


# --- companies -----------------------------------------------------------------------

@app.get("/api/companies")
async def api_companies():
    return {"portfolio": portfolio_tools.portfolio_snapshot(),
            "adhoc": portfolio_tools.adhoc_snapshot()}


@app.get("/api/resolve")
async def api_resolve(q: str = ""):
    """Map a symbol or company name the investor typed to an NSE/BSE symbol."""
    from ..ingest import symbols
    from ..llm.intent import detect_ticker

    query = q.strip()[:80]
    if not query:
        raise HTTPException(400, "type a symbol or company name")
    upper = query.upper()
    found = upper if symbols.is_listed(upper) else await asyncio.to_thread(detect_ticker, query)
    if not found:
        raise HTTPException(404, "no listed company matches that")
    return {"ticker": found, "name": symbols.company_name(found)}


@app.get("/api/company/{ticker}")
async def api_company(ticker: str):
    ticker = _normalize_ticker(ticker)
    from ..tools import metrics as metrics_mod
    from ..tools import guidance as guidance_mod
    from ..tools import portfolio as pf  # noqa: F401 (median peers)

    snap = prices_ingest.price_snapshot(ticker)
    quarterly = db.quarterly_series(ticker, limit=8)
    if ticker not in _hydrated:
        await _hydrate_company(ticker, prices=snap is None)
        _hydrated.add(ticker)
        snap = prices_ingest.price_snapshot(ticker)
        quarterly = db.quarterly_series(ticker, limit=8)
    from ..ingest.discovery import coverage as coverage_of

    if (snap or quarterly) and os.getenv("FINN_TEST_DB") != "1":
        # Picks up newer transcripts even for covered companies; indexed files are skipped.
        _start_prepare(ticker)
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
        "coverage": coverage_of(ticker),
        "preparing": _prepare_state.get(ticker),
        "watching": ticker in portfolio_tools.watched_tickers(),
    }


_hydrated: set[str] = set()
_prepare_state: dict[str, dict] = {}


def _start_prepare(ticker: str) -> None:
    """Fetch and index the company's newest transcripts in the background, once."""
    state = _prepare_state.get(ticker)
    if state and state["state"] in ("running", "done"):
        return
    _prepare_state[ticker] = {"state": "running", "message": "Finding the latest call transcripts"}

    def progress(message: str) -> None:
        _prepare_state[ticker]["message"] = message

    async def run() -> None:
        from ..ingest.discovery import ensure_research_docs

        try:
            result = await asyncio.to_thread(ensure_research_docs, ticker, 4, 120.0, False, progress)
            ready = any(d["status"] == "ready" for d in result.get("documents", []))
            _prepare_state[ticker] = {
                "state": "done" if ready else "failed",
                "message": "Ready" if ready else "No readable transcripts were found for this company",
                "documents": result.get("documents", []),
            }
        except Exception:
            log.exception("prepare failed for %s", ticker)
            _prepare_state[ticker] = {"state": "failed", "message": "Could not fetch documents right now"}

    asyncio.get_running_loop().create_task(run())


@app.get("/api/company/{ticker}/ledger")
async def api_company_ledger(ticker: str):
    """Management's numeric promises from the last four calls, graded against reported results."""
    from .. import brief as brief_mod
    from ..tools.ledger import build_ledger

    ticker = _normalize_ticker(ticker)
    if ticker not in _hydrated and os.getenv("FINN_TEST_DB") != "1":
        await _hydrate_company(ticker, prices=False)
        _hydrated.add(ticker)
    ledger = await build_ledger(ticker)
    ledger["watchpoints"] = brief_mod.draft_from_ledger(ticker, ledger)
    return ledger


@app.get("/api/company/{ticker}/watchpoints")
async def api_watchpoints(ticker: str):
    from .. import brief as brief_mod

    return {"watchpoints": brief_mod.watchpoints(_normalize_ticker(ticker))}


@app.post("/api/company/{ticker}/watchpoints")
async def api_watchpoint_add(ticker: str, body: dict):
    from .. import brief as brief_mod

    text = str((body or {}).get("text") or "").strip()
    if not 3 <= len(text) <= 160:
        raise HTTPException(400, "watchpoint text must be 3 to 160 characters")
    return brief_mod.add_watchpoint(_normalize_ticker(ticker), text)


@app.delete("/api/company/{ticker}/watchpoints/{wp_id}")
async def api_watchpoint_delete(ticker: str, wp_id: int):
    from .. import brief as brief_mod

    brief_mod.delete_watchpoint(_normalize_ticker(ticker), wp_id)
    return {"ok": True}


# --- brief and verdicts ---------------------------------------------------------------------

@app.get("/api/brief")
async def api_brief(hours: int = 24):
    from .. import brief as brief_mod

    return brief_mod.brief(max(1, min(hours, 24 * 30)))


@app.post("/api/brief/seen")
async def api_brief_seen():
    from .. import brief as brief_mod

    return {"last_look": brief_mod.mark_seen()}


@app.post("/api/alerts/{alert_id}/verdict")
async def api_verdict(alert_id: int, body: dict):
    from .. import brief as brief_mod

    try:
        return brief_mod.set_verdict(alert_id, str((body or {}).get("verdict", "")),
                                     str((body or {}).get("note", "")),
                                     bool((body or {}).get("mute_category")))
    except ValueError:
        raise HTTPException(400, "verdict must be no_impact, watch, or changes_story")
    except LookupError:
        raise HTTPException(404, "alert not found")


@app.get("/api/alerts/{alert_id}")
async def api_alert(alert_id: int):
    alert = db.get_alert(alert_id)
    if not alert:
        raise HTTPException(404, "alert not found")
    from .. import brief as brief_mod

    points = brief_mod.watchpoints(alert["ticker"])
    alert["promise_check"] = brief_mod.promise_check(alert, points)
    alert["touches"] = brief_mod.touches(alert, points, alert["promise_check"])
    return alert


@app.get("/api/verdicts")
async def api_verdicts():
    from .. import brief as brief_mod

    return {"verdicts": brief_mod.verdict_log()}


@app.get("/api/company/{ticker}/coverage")
async def api_company_coverage(ticker: str):
    from ..ingest.discovery import coverage as coverage_of

    ticker = _normalize_ticker(ticker)
    return {"ticker": ticker, "coverage": coverage_of(ticker), "preparing": _prepare_state.get(ticker)}


@app.post("/api/watchlist")
async def api_watchlist_add(body: dict):
    ticker = _normalize_ticker(str((body or {}).get("ticker", "")))
    return {"watchlist": portfolio_tools.add_to_watchlist(ticker)}


@app.delete("/api/watchlist/{ticker}")
async def api_watchlist_remove(ticker: str):
    return {"watchlist": portfolio_tools.remove_from_watchlist(_normalize_ticker(ticker))}


def _normalize_ticker(raw: str) -> str:
    ticker = raw.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&.-]{0,19}", ticker):
        raise HTTPException(400, "invalid NSE/BSE ticker")
    return ticker


async def _hydrate_company(ticker: str, prices: bool = True) -> None:
    """Best-effort on-demand hydration for any NSE/BSE symbol: quote and live quarterly numbers."""
    from ..ingest.screener import ingest_quarterly

    def load_prices() -> None:
        for row in prices_ingest.fetch_eod(ticker, days=60):
            db.put_price(ticker, row["date"], row["close"], row["volume"])

    jobs = [asyncio.to_thread(ingest_quarterly, ticker)]
    if prices:
        jobs.append(asyncio.to_thread(load_prices))
    await asyncio.gather(*jobs, return_exceptions=True)


# --- settings -------------------------------------------------------------------------

@app.get("/api/settings")
async def api_settings_get():
    return engine.get_thresholds()


@app.post("/api/settings")
async def api_settings_post(body: dict):
    saved = engine.set_thresholds(body)
    engine.rescore_announcements()
    return saved


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
    from .. import brief as brief_mod

    try:
        stats = await run_pipeline(hours=24, push=True, sample=True)
    except Exception:
        log.exception("demo run failed")
        raise HTTPException(500, "Demo pipeline failed. Check server logs and retry.")
    if os.getenv("FINN_TEST_DB") != "1":
        try:
            await brief_mod.draft_for_results(db.feed(since_hours=24, include_read=True))
        except Exception:
            log.exception("promise ledger warm-up failed")
    return stats
