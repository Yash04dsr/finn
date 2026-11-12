# FINN — the investor's morning brief, on your phone

FINN is a mobile-first financial investment agent built for the ENAM AI Engineer Build Challenge.
It runs a daily **Push** loop (what changed across your portfolio, ranked so what matters is first
and routine paperwork is collapsed) and a grounded **Pull** analyst that answers only from verified
issuer-hosted primary sources — annual reports, concall transcripts, results filings — and refuses
when that evidence is unavailable.

Built on **Google's Agent Development Kit (ADK) v2.14** (multi-agent: a routing coordinator plus a
grounded ResearchAnalyst), with deliberate **two-tier model routing** and a live **token-usage ledger**.

## Clients

- **Expo app** (`mobile/`) — iOS/Android via Expo Go for local UI testing or an
  EAS preview build for remote push notifications.
- **Next.js PWA** (`frontend/`) — no-install web fallback using the same API.

## Quick start (3 minutes)

```bash
# 1. Backend (Python 3.12+, uv)
cd backend
uv sync
cp .env.example .env         # set HYDE_API_KEY (OpenAI-compatible gateway)
uv run python -m finn.ingest.seed          # write demo snapshots
uv run python -m finn.ingest.official_docs # ingest issuer-hosted PDFs for the research demo
uv run uvicorn finn.api.main:app --port 8000

# 2. Expo app (Node 20+)
cd ../mobile
npm install
npx expo start               # scan the QR with Expo Go (same Wi-Fi as this machine)
# in the app: Settings → set Backend URL to http://<your-lan-ip>:8000
```

Web fallback: `cd frontend && npm install && npm run dev` → http://localhost:3000.
In **Settings → Ops**, tap **Run demo pipeline** to trigger one full Push cycle
(ingest → classify → enrich → thresholds → digest). Then read the feed.

## What to try first (3-minute demo)

1. **Feed** — windowed digest: results filings with the deterministic QoQ/YoY first-cut
   (Revenue/EBITDA/PBT/PAT), a CFO-change with the incoming person's bio, unusual
   volume/price moves against *your* thresholds, and routine filings collapsed into a count.
   Tap any alert → "Why am I seeing this?" → **Ask FINN about this filing**.
2. **Chat** — ask *"What guidance did Persistent management give for FY26 and are they
   delivering against it?"* Watch it route to the ResearchAnalyst, search the transcripts,
   pull the metrics tool, and answer with [S#] citations. Then ask about a company with no
   documents (e.g. *"Suzlon Q2 numbers?"*) — it refuses rather than hallucinating.
3. **Settings** — move the volume-spike slider from 2.5× to 5×; the feed's alert logic
   changes accordingly (that's the point: *you* decide what "unusual" means).
   Check the cost dashboard: bulk work runs on the fast tier, analysis is where tokens go.

## Architecture in one paragraph

FastAPI backend on SQLite (WAL + FTS5). Push side: NSE announcements + yfinance EOD +
Screener quarterly numbers → hybrid classifier (regex-first, LLM only for ambiguous,
batched) → deterministic threshold engine (user-configurable) → enrichers (results
first-cut math in pure Python; exec bio via fast tier) → digest composer (priority-ranked,
noise counted not shown) → web-push + in-app inbox. Pull side: ADK root agent (routes)
→ ResearchAnalyst sub-agent with function tools over an FTS5 corpus and a metrics tool —
the model narrates numbers it never computes. Provider-reported token usage is logged by
routing tier and surfaced honestly as telemetry, not billed cost. The light Swiss-style
Next.js 15 PWA streams chat over SSE.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture and
[docs/DECISIONS.md](docs/DECISIONS.md) for what we deliberately left out.

## Repository map

```
backend/
  finn/agent.py               # ADK root agent + sub-agent wiring
  finn/agents/                # ResearchAnalyst (grounded), DigestWriter
  finn/tools/                 # RAG (FTS5), metrics math, prices, portfolio
  finn/alerts/                # classifier, threshold engine, digest, Expo/web push
  finn/ingest/                # NSE feed (+snapshot), yfinance, screener, PDF chunker
  finn/api/main.py            # FastAPI: SSE chat over ADK Runner + REST
  finn/pipeline.py            # one EOD pass, end to end
  finn/scheduler.py           # APScheduler (18:30 IST, Mon–Fri)
  tests/                      # pytest suite (math, thresholds, integrity, API, push, FTS)
  evals/                      # grounding evals: cite-or-refuse contract
mobile/                       # Expo (React Native) app — primary client
frontend/                     # Next.js 15 PWA — fallback web client
docs/                         # ARCHITECTURE, DECISIONS, demo-script, WRITEUP
```

## Configuration

| Env var | Purpose |
|---|---|
| `HYDE_API_KEY` / `HYDE_BASE_URL` | OpenAI-compatible LLM gateway |
| `FINN_MODEL_FAST` | fast tier (default `hyde/glm-5.3-flash`) |
| `FINN_MODEL_REASONING` | reasoning tier (drop in a stronger model without code changes) |

User-configurable in-app: volume multiplier, price-move %, category watchlist, quiet hours.

## Tests & evals

```bash
cd backend && uv run pytest -q
uv run python -m evals.run_evals        # grounding: cite-or-refuse contract (LLM keys needed)
```
