# AI build history — how FINN was built

This project was built **with** AI coding agents, and the conversation exports are part
of the submission (see WRITEUP.md checklist). This note explains the working pattern,
since the exports are long.

## The setup

- **Cursor (agent mode)** drove the whole build: planning, implementation, debugging,
  tests, evals, and verification loops.
- A **plan file** (`finn_build_plan_5952a9a9.plan.md`) was written first — architecture,
  differentiators, repo layout, execution order — then implemented todo-by-todo with the
  todo list as the source of truth.
- The **frontend was built by a background subagent** from a precise API contract while
  the main agent built the backend in parallel; the same pattern was used for the Expo
  app. Contracts-first delegation meant the two halves integrated on the first try.

## Verification-driven loops (what made the build trustworthy)

Every layer was made to prove itself before moving on:

1. **Smoke first**: one ADK agent call through the gateway before any architecture was
   built on it (caught the v2 LiteLlm kwargs change in minute one).
2. **The pipeline was run end-to-end repeatedly** against real LLM calls; output
   quality was *inspected*, which caught a thinking-model token-budget failure (empty
   content, reasoning-only responses) that tests alone would have missed.
3. The **pytest suite** pins deterministic math, thresholds, classification, source
   integrity, push tickets, idempotency, FTS, and API contracts. Several tests found
   real bugs (FTS sync, digest ordering, fiscal-quarter normalization, stale demo data)
   — those fixes are in the git history.
4. **End-to-end evals through the real chat endpoint** (`evals/run_chat_evals.py`):
   grounded promise question, unseen ticker, out-of-corpus question, advice request,
   off-topic question, prompt injection, portfolio question. Results saved to
   `evals/results/latest.json`.
5. **Screens checked at phone size** in the browser after each change, which caught
   unlabelled sample numbers, a 16-item "two-minute" brief, and model working notes
   leaking into answers. Each was fixed and rechecked.

## The redesign pass

After the first version worked, the build was re-planned from the investor's side:
who the user is (a PM at a concentrated fund), what their day looks like, and which
pains matter most. That produced the Brief, Verdict, Dig in model and the Promise
ledger. The plan was checked against widely used agent skills: Impeccable for design,
the design-taste anti-slop rules, source-driven development for Expo APIs, security
and hardening, LLM and RAG evaluation, and shipping and launch.

Bugs found in that pass, with live evidence:
- 119 alerts in the database were 41 real items; old runs had duplicated them.
- NSE times were read as UTC instead of India time.
- The research model wrote its private reasoning into answers; fixed with an answer
  tag and a fast-tier rewrite, with citations validated after the rewrite.
- Screener's page markup changed, so live quarterly numbers had silently stopped and
  illustrative numbers were showing instead.
- The ledger first counted an analyst's question as a management promise; quotes
  that are questions are now rejected.
- Parallel ingestion shared one SQLite connection across threads; database access is
  now serialised.

## Debugging stories worth reading in the transcripts

- Discovering ADK 2.x API changes by reading installed source (`inspect.getsource`) and
  adapting (Runner now takes `app=`, LiteLlm takes flat kwargs).
- Diagnosing the thinking-model token budget: raw `litellm` call inspection showed
  `content: None` with reasoning populated → built the salvage + strip layer in
  `llm/routing.py`, then tightened it twice against real outputs.
- The Hyde key's model allowlist surfaced mid-build (403 on the reasoning model) — the
  two-tier architecture was kept in config/ledger and validated with a live second
  model before falling back to a single permitted model.
- FTS5 external-content tables silently not syncing on INSERT → explicit index
  maintenance in `add_chunk`, plus a test that would have caught it day one.

## Model usage

- Cursor agent: planning, backend, delegation, verification.
- FINN's tiers are documented in `docs/ARCHITECTURE.md`. The key permits one model,
  so the fast tier runs it with low reasoning (measured in `evals/routing_bench.py`).
  The usage ledger reports provider token counts by tier, not billed money.
