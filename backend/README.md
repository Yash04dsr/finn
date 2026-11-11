# FINN backend

Google ADK v2.14 multi-agent backend: push pipeline (ingest → classify → enrich →
thresholds → digest → push) + grounded pull analyst over an FTS5 corpus.

## Layout
- `finn/agent.py` — root LlmAgent, sub-agent wiring
- `finn/agents/` — ResearchAnalyst (grounded), DigestWriter
- `finn/tools/` — RAG (FTS5 + citations), pure-Python metrics math, prices, portfolio
- `finn/alerts/` — hybrid classifier, user-configurable threshold engine, digest composer, Expo/web push
- `finn/ingest/` — NSE announcements (+snapshot fallback), yfinance EOD, Screener quarterly, PDF chunker, seeders
- `finn/api/main.py` — FastAPI: SSE chat over the ADK Runner + REST contract
- `tests/` — 31 tests; `evals/` — cite-or-refuse grounding evals (3/3)

## Run
```bash
uv sync
cp .env.example .env     # set HYDE_API_KEY
uv run python -m finn.ingest.seed && uv run python -m finn.ingest.seed_docs
uv run uvicorn finn.api.main:app --port 8000
```

Then `POST /api/demo/run` once (or tap it in the app's Settings) to populate the feed.
