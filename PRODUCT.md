# Product

<!-- impeccable:product-schema 1 -->

## Platform

web-first (adaptive PWA)

A brief you finish, graded against management's own words.

The primary deliverable is the Next.js PWA (`frontend/`), deployed on Vercel and backed by Render, with zero-install access on phone and desktop. An Expo app (`mobile/`) is kept in the repo as an additional native client sharing the same API and visual system.

## Users

A portfolio manager or analyst at a lean, concentrated, long-horizon public-markets fund, modelled on ENAM: a small team that makes high-conviction decisions and lives with the outcomes. They hold 15 to 20 Indian listed companies they know well and hold through cycles. They do not trade on headlines.

Their day: a check before the open ("did anything I own change?"), filings that arrive at any hour, a look at price and volume after the close, a burst of results in results season, and a quarterly review of whether management did what they said.

## Product Purpose

FINN ends the investor's daily monitoring work in about two minutes and lets them go deep only where it matters. Success is a finished decision on each material item, not time spent in the app.

## Positioning

- **Finish the Brief**: each material item names the watchpoint or part of the thesis it touches, and the brief ends with a clear done state once verdicts are recorded. Routine paperwork becomes a count.
- **Promise Check & Promise Ledger**: results alerts grade delivered numbers against management's earlier guided bands in code (`kept`, `missed`, `in_band`, `no_guidance`), and each company page leads with the Promise ledger citing both the promise and the outcome.
- **Primary-source Ask**: research answers come only from annual reports, call transcripts, results filings, and presentations, and the server checks every citation against what was actually read.
- **Any NSE/BSE ticker**: FINN finds and reads a company's newest transcripts (or annual report) on demand with visible progress, or states plainly when no primary documents exist.

## Operating Context

- NSE alone publishes roughly 900 to 1,500 equity announcements a trading day, most of them routine.
- Reading one results filing plus its call properly takes 30 to 60 minutes.
- Sources: NSE announcements, end-of-day prices (yfinance), Screener.in quarterly tables and document links, issuer and BSE-hosted PDFs.
- Used on a phone or desktop browser, often before the market opens or on a commute.

## Capabilities and Constraints

- Push: a windowed brief (12h, 24h, 3d, 7d), price and volume alerts on thresholds the investor sets, category watchlist, quiet hours, and Web Push (on iOS 16.4+, requires Add to Home Screen).
- Verdicts on each material item: `No impact`, `Watch closer`, `Changes the story` (with an optional one-line reason). Saved with a date as a decision journal.
- Pull: grounded research chat with checked citations, model tier/token/cache visibility, and the Promise ledger.
- A labelled sample day exists for demos and is never presented as live activity.
- Numbers and promise checks are computed in code, never by a model. Model routing: a fast model for classification, extraction, and short summaries; a reasoning model only for research synthesis.
- No buy, sell, or hold advice. Off-topic questions get a one-sentence refusal.
- Undecided: per-user accounts (single investor today).

## Brand Commitments

- Name: FINN.
- Voice: plain sentences, like a person at a brokerage counter. No dashes, no section labels in answers, no market storytelling, no "AI-powered" filler.
- The Next.js web app and the Expo app share the same Swiss system: white ground, black type, square corners, bottle green and oxblood only for up and down numbers.

## Evidence on Hand

- Issuer-hosted Persistent and Crompton PDFs plus BSE transcripts fetched on demand for any ticker.
- Live Screener quarterly numbers.
- The sample day in `backend/data/snapshots/announcements.json` is illustrative and must stay labelled.
- No customers, testimonials, or performance claims exist. Do not invent them.

## Product Principles

1. Finish the investor's job: the brief has an end state.
2. Every number has a source one tap away; anything illustrative says so.
3. Code decides verdicts, promise checks, and math; models only read and write language.
4. Filter ruthlessly: routine paperwork is counted, not shown.
5. Primary sources or an honest "not covered".

## Accessibility & Inclusion

Touch targets of at least 44px, labels on every control, text that scales, safe-area padding on mobile, and every gesture has a tap equivalent.
