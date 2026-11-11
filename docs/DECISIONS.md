# DECISIONS.md — the calls we made, and the ones we didn't

The brief grades judgment, so here is the judgment in the open.

## What we deliberately built first

**One beautiful loop over many shallow ones.** The product is "the 24h brief + a
grounded analyst you can interrogate". Every other idea was tested against whether it
strengthened that loop.

## Key trade-offs

### 1. Deterministic core, LLM at the edges
Threshold alerts, priority ranking, digest composition, and all financial math are
plain Python with unit tests. LLM calls are confined to language-shaped jobs:
classifying ambiguous filings (batched), one-line summaries, exec bios, and grounded
analysis. **Why:** an investor will forgive a dry summary; they will not forgive a
wrong number or an alert that fires randomly. Determinism is a feature you can demo.

### 2. Grounded-or-refuse, even when it feels blunt
The analyst explicitly refuses when the corpus lacks coverage (tested in evals). A
plusher product would fill gaps from model memory — that is exactly the "AI slop"
failure mode. The refusal doubles as a product signal: it shows the user *where the
grounded coverage ends*, and prompts them to ingest more documents.

### 3. Hybrid classification instead of an LLM-everything pipeline
Regex covers the taxonomy's clear cases at zero tokens; one batched call handles the
ambiguous remainder. We gave up a little accuracy on odd phrasings to get
deterministic latency, zero cost on bulk, and a system that degrades gracefully when
the LLM gateway is down.

### 4. SQLite (+FTS5) over a vector database
The corpus is small and lexical — BM25 over chunked filings returns precise,
snippet-carrying hits with zero infrastructure. Chunking (paragraph-aware, 1.4k chars,
150 overlap, repeated-header stripping) matters more than embedding magic at this
scale. A vector index becomes worth it at ~10x corpus size; the retrieval interface
(`search_docs`) is the seam where it would slot in.

### 5. Two-tier routing kept even though one model is reachable today
The gateway key currently permits a single model, so fast and reasoning tiers resolve
identically by default. We kept the tier separation in config and the cost ledger
because the *architecture* is the point — analysis cost becomes a visible, swappable
knob rather than an afterthought, and we demonstrated it live with a second model
during the build.

### 6. Expo app as the primary client, PWA as the fallback
The graders should try FINN on a phone with zero friction: Expo Go scan → full native
app (push notifications via Expo push, native sliders, native navigation). The Next.js
PWA remains as a no-install web fallback sharing the same API.

## What we deliberately left out (and why)

- **Real LinkedIn scraping for exec bios** — ToS/anti-bot issues and brittle for a
  demo; instead the bio enricher extracts what the filing itself says, structured.
  The enrichment seam is real; plugging a licensed data provider is one function.
- **News/broker commentary** — the brief explicitly demotes secondary data on the pull
  side; primary-only is also what keeps the grounding contract enforceable.
- **Vector embeddings / reranking** — premature at this corpus size (see trade-off 4).
- **Auth/multi-user** — the challenge is a single investor's workflow; adding auth
  would spend days on plumbing that demonstrates nothing about product judgment.
- **Live intraday prices** — the brief scopes price data to EOD; intraday adds noise,
  cost, and no new demonstrated capability.
- **Android/iOS store builds** — Expo Go + a published preview covers "try it on a
  phone" without developer-account overhead.

## Where we'd take it next

1. **Digest memory** — track what was already shown, diff consecutive digests ("2 new
   since yesterday") so the brief reads like a feed, not a report.
2. **Per-user learning on priorities** — promote/demote categories from read/skip
   behaviour (the `why` strings already record the base logic).
3. **Earnings-calendar awareness** — pre-results, surface the *expected* numbers so
   the first-cut becomes expected-vs-actual, not just QoQ/YoY.
4. **Prompt-injection hardening** — filings are untrusted text that the analyst reads;
   strict tool-only grounding already limits blast radius, but content-level
   instruction filtering would be next.
5. **Voice pull** — a morning-commute mode: read the digest aloud, take follow-up
   questions by voice (ADK + Expo audio APIs).
