# FINN — 3-minute demo script (Expo app)

Setup: backend running (locally or deployed). Expo app open via Expo Go.
If the feed is empty: **Settings → Ops → "Run demo pipeline"** once, then pull to refresh.

---

## 0:00 — The morning brief (Push)

Open the **Feed** tab.

> "Every morning FINN gives me one screen: what changed across my 17 companies,
> ranked so what matters is first."

- Point at the **digest hero**: "9 shown · 4 routine collapsed" — routine paperwork is
  *counted, not shown*. The app earns attention instead of demanding it.
- Tap the **Persistent results** alert → detail sheet shows the **first cut**:
  Revenue / EBITDA / PBT / PAT with QoQ and YoY chips — computed from stored filings,
  not the model's memory.
- Tap the **CFO change** alert → FINN's one-line summary plus the **incoming person
  card** — you instantly know who is taking over.
- Tap **"Why am I seeing this?"** → the reason is spelled out (category, tier, your
  watchlist). Explainability is a right, not an easter egg.

## 1:10 — Unusual means what I say (Settings)

Go to **Settings**.

- Slide **volume multiplier** from 2.5× to 5×, then tap **Save changes**:
  "I decide what 'unusual' means. The engine watches every EOD bar against *my*
  thresholds."
- Point at **Token usage**: provider-reported tokens, fast vs reasoning split.
  "This is transparent usage telemetry—not a made-up rupee estimate."
- (If push was enabled): "This exact alert would have buzzed my phone at 18:30."

## 1:50 — The grounded analyst (Pull)

Go to **Chat** (or tap "Ask FINN about this filing" from any alert).

Ask: **"What did Persistent report about Q2 FY26 margin drivers and cash conversion?"**

> "This is the narrative-vs-numbers question — the difference between summarising
> management and analysing them."

- Watch the tool chips: it searches the issuer-hosted Q2 transcript and answers with
  **[S#] citations**. Tap a citation chip to open the Persistent-hosted PDF and inspect
  the cited passage.
- Follow up: **"What changed between Crompton's Q1 commentary and Q2 results?"** FINN
  compares Crompton's issuer-hosted call transcript and Q2 investor presentation.
- Then: **"Suzlon Q2 numbers?"** → FINN **refuses**: not in the primary sources.
  Grounded means grounded — no vibes, no news, no model memory.

## 2:50 — Close

Back to **Feed**: "Prices and volume run through the same threshold engine — that
volume-spike alert exists because I set 2.5×. Everything on this screen is either
important, or a count of what wasn't."

---

## One-line answers for likely questions

- **Why not vector search?** Corpus is small and lexical; BM25 with citations is
  precise and testable. The retrieval interface is the seam for embeddings later.
- **What stops hallucination?** The model never computes numbers (pure-Python metrics
  tool), and the eval suite asserts cite-or-refuse. Primary sources only.
- **How is this different from a ChatGPT wrapper?** Deterministic alerting you can
  configure, deterministic math, a citation contract with tests, and cost visible in
  the product. The LLM is a component, not the product.
- **What's the model cost per day?** FINN reports token usage by tier, not money. A
  billed-cost claim needs the provider's pricing and cache accounting, so the UI does
  not invent one.
