# FINN — 3-minute demo script

Setup: backend running (`uv run uvicorn finn.api.main:app --port 8000`), Expo app open
(Expo Go or the published preview). If the feed is empty, Settings → "Run demo pipeline"
once.

---

## 0:00 — The morning brief (Push)

Open the **Feed** tab.

> "Every morning FINN gives me one screen: what changed across my 17 companies,
> ranked so what matters is first."

- Point at the **digest hero**: "9 shown · 4 routine collapsed" — *routine paperwork is
  counted, not shown. The app earns attention instead of demanding it.*
- Tap the **Persistent results** alert → the detail sheet shows the **first cut**:
  Revenue/EBITDA/PBT/PAT with QoQ and YoY chips — computed from stored filings, not the
  model's memory.
- Tap the **CFO change** alert → FINN's one-line summary plus the **incoming person
  card** — you instantly know who is taking over.
- Tap **"Why am I seeing this?"** → the reason is spelled out (category, tier, your
  watchlist). *Explainability is a right, not an easter egg.*

## 1:10 — Unusual means what I say (Settings)

Go to **Settings**.

- Slide **volume multiplier** from 2.5× to 5×, then back to 2×: "I decide what
  'unusual' means. The engine watches every EOD bar against *my* thresholds."
- Point at the **cost dashboard**: total tokens, fast vs reasoning split.
  "Bulk work runs on the cheap tier — the ledger is in the product, not a slide."

## 1:50 — The grounded analyst (Pull)

Go to **Chat** (or tap "Ask FINN about this filing" from any alert).

Ask: **"What guidance did Persistent management give for FY26 and are they delivering
against it?"**

> "This is the narrative-vs-numbers question — the difference between summarising
> management and analysing them."

- Watch the tool chips: it **searches the transcripts**, pulls the **metrics tool**,
  then answers: guidance 18–22% / 19% exit margin (quoted from the Q2 call), delivery
  +22.8% YoY and 19.2% margin — **with [S#] citations** back to the transcript and the
  results filing. Tap a citation chip.
- Follow up: **"What about Suzlon's Q2 numbers?"** → FINN **refuses**: not in the
  primary sources. *Grounded means grounded — no vibes, no news, no model memory.*

## 2:50 — Close

- Back to **Feed**: "Prices and volume run through the same threshold engine — that
  volume spike alert exists because the user set 2.5×. Everything on this screen is
  either important, or a count of what wasn't."

---

## One-line answers for likely questions

- **Why not vector search?** Corpus is small and lexical; BM25 with citations is
  precise and testable. The retrieval interface is the seam for embeddings later.
- **What stops hallucination?** The model never computes numbers (pure-Python metrics
  tool), and the eval suite asserts cite-or-refuse. Primary sources only.
- **How would you make money with this?** It is a workflow product for a lean fund —
  the digest is the retention surface, the analyst is the depth surface.
- **What's the model cost per day?** Shown in Settings — bulk classification is one
  batched call, one-liners are capped at 60 output tokens, analysis is where tokens
  deliberately go.
