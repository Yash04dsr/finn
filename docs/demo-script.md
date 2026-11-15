# FINN: three-minute demo (Web PWA)

**A brief you finish, graded against management's own words.**

Before starting: open the Vercel web app (`frontend/`). If the brief is empty, go to **Settings → Load the sample day**. (If the Render free-tier backend was asleep, the first load takes ~30–50s.)

## 0:00 Step 1 — Finish the Brief and record verdicts

Open **Brief** (`/`).

> "Every morning FINN gives me one decision at a time. NSE publishes over a thousand filings a day; here are the items that matter to my book, and routine filings are counted, not shown."

- Point at the focus card (`Decide 1 of N`):
  - the inline Revenue, EBITDA, and PAT with year-on-year change (labelled when illustrative)
  - the **Touches** line, naming the watchpoint it bears on, and any past verdict on similar filings
- Tap **No impact**. The next item comes up. Tap **Show fewer results filings** in the toast to show that ranking learns from decisions.
- Tap **Changes the story** on a later card and add a one-line reason—saved to the decision journal.
- Tap **Listen** for a few seconds: the commute version of the same brief (`speechSynthesis`, `en-IN`).
- Finish the remaining items to reach the **You are done for this window** end state.

## 0:55 Step 2 — Promise Check and Promise Ledger

Tap a results alert or open `/alert/[id]` (also where Web Push notifications deep-link):

- **PromiseCheck**: delivered numbers graded in code against management's earlier guided band (`kept`, `missed`, `in_band`, or `no_guidance`), with links to both the guidance quote and the results filing.
- For leadership filings, the **BioCard** shows the appointee's background extracted from the SEBI LODR filing itself.
- Tap through to the company page (`/company/PERSISTENT`):
  - **Promise ledger** at the top: credibility summary (e.g. "Kept X of Y checkable promises") and each commitment graded against reported numbers, citing the transcript PDF.
  - **Decision history**: your recorded verdicts and reasons for this company, newest first.

## 2:00 Step 3 — Unseen NSE/BSE ticker on demand

Open **Ask** (`/chat`) or visit a new ticker page:

- Ask about a pre-loaded company first: "Did PERSISTENT deliver what management promised?"
  - The answer streams with primary-source citations `[1]`, `[2]` verified on the server, and source cards that open the issuer or BSE PDF.
  - The footer shows the model tier (`reasoning`), token count, cost (when priced), and cache state.
- Ask "Should I buy Persistent?": one sentence, no call.
- Ask about an unseen NSE/BSE ticker (for example, `VEDL` or `ITC`):
  - Staged progress shows FINN pulling live quarterly numbers, finding and reading the newest transcripts (or annual report for ITC), and grading promises—then answering with primary-source citations.

## Likely questions

- **Why web-first instead of Expo?** Zero install for graders on any phone or desktop, with `mobile/` kept in the repo as an additional native client. On iOS 16.4+, Web Push works after **Add to Home Screen** in Safari.
- **How is cost controlled?** Code does the math, `promise_check`, and ranking. The fast tier runs with `reasoning_effort=low` (68 vs 607 output tokens on the same jobs). Guidance extraction is cached per document, and research answers are reused at 0 tokens until documents or numbers change.
- **What stops hallucination?** Routing in code, primary documents only, server-side citation checks, and quotes verified against source passages.
