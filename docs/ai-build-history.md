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
4. **A custom eval suite** (`evals/run_evals.py`) asserts the agent-level contract:
   grounded answers cite [S#] with the right numbers; out-of-corpus questions get
   refusals, not vibes. 3/3 passing.
5. **Browser verification on a phone viewport** for the PWA, screenshots included.

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
- FINN's two logical routing tiers are documented in `docs/ARCHITECTURE.md`; the
  in-product usage ledger reports provider token metadata by tier. It deliberately
  does not present token counts as billed monetary cost.
