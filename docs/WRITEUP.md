# Covering note (draft)

**To:** assessment@enam.com
**Subject:** IIT Delhi – AI Engineer - 2027

---

Dear ENAM team,

**A brief you finish, graded against management's own words.**

**Who I built for.** I started from the investor in your brief: a small team making high-conviction decisions and living with the outcomes. That is a portfolio manager with 15 to 20 Indian listed companies who protects the reason they own each one. Their day has a check before the open, filings at any hour, a results season where each filing and call takes 30 to 60 minutes, and a quarterly question: did management do what they said? NSE alone publishes around a thousand announcements a day, most of them paperwork.

**What I built.** FINN is a web-first Next.js PWA (`frontend/`, deployed on Vercel and backed by a FastAPI service on Vercel) built around three steps:

1. **Finish the Brief and record verdicts.** The home screen shows only the items that need a decision, one at a time, with routine filings counted rather than shown. Each item names the watchpoint it touches, recalls your past verdict on similar items, and ends with "You are done for this window" once decided. Verdicts (`No impact`, `Watch closer`, `Changes the story`) and optional one-line reasons are saved to a decision journal.
2. **Promise Check on results alerts and Promise Ledger on company pages.** Results alerts compute Revenue, EBITDA, and PAT YoY in code and attach a deterministic **PromiseCheck** (`kept`, `missed`, `not_reported`, or `no_guidance`) comparing reported numbers against management's earlier guided band. Opening the alert (`/alert/[id]`) or the company page (`/company/[ticker]`) shows both citations side by side, the full Promise ledger, and your decision history.
3. **Unseen NSE/BSE ticker on demand.** Ask about or open any NSE/BSE ticker FINN has never seen. It pulls live quarterly numbers, finds and indexes the newest call transcripts (or the latest annual report when a company holds no calls, such as ITC) with staged progress, and answers only from server-verified primary citations—or states plainly when no primary documents exist.

An Expo app (`mobile/`) is also kept in the repo as an additional native client speaking the same API.

**Key trade-offs.**
1. *Web-first over Expo as the primary deliverable.* A Vercel URL opens immediately on any phone or desktop browser with zero install, no Expo Go tunnel drops, and one link to grade. The trade-off is that on iOS (16.4+), Web Push requires **Add to Home Screen** in Safari before notifications can be enabled.
2. *Code decides numbers and promise checks; models read and write.* Numbers, ranking, `promise_check`, ledger grading, routing, and citation verification are deterministic Python with tests. Models handle ambiguous filing classification, guidance extraction, executive profiles, short lines, and research synthesis. An investor forgives a dry sentence, not a wrong number.
3. *Routing in code, not by the model.* Company questions always go to the grounded research analyst, so nothing about a company is answered from model memory. Buy/sell/hold requests and off-topic questions are declined in one sentence before any model runs.
4. *Model routing on one key.* My key allows one model (`hyde/glm-5.3-flash`), so the fast tier runs it with `reasoning_effort=low` and the reasoning tier runs full reasoning for synthesis only. Bulk jobs used 68 output tokens against 607 with the same answers. Guidance extraction is cached per document, and research answers are reused at zero tokens until a company's documents or numbers change. Every chat answer displays its tier, token count, cost (when priced), and cache state.
5. *Executive backgrounds from the filing.* SEBI LODR requires an appointee profile in the filing itself; FINN reads it there rather than scraping LinkedIn.

**Deliberately cut.**
- *Pre-results prep card*: useful before earnings, but a second new workflow dilutes the core brief + promise check loop; listed as next.
- *Buy/sell/hold calls, news, broker notes, multi-user accounts, and intraday prices*: out of scope for a concentrated, primary-source monitoring workflow.
- *Expo feature parity*: `mobile/` remains frozen and working in the repo while `frontend/` carries the primary web-first experience.

**Where I would take it next.** A pre-results prep card ahead of scheduled earnings, a stronger second model for the reasoning tier measured on quality per rupee, and a weekly portfolio-wide "promises kept" review.

**Trying it.** Open the Vercel link on desktop or phone (note: a cold Render free-tier backend can take ~30–50s on the first request). Use **Settings → Load the sample day** if the brief is empty, or follow the three-step walkthrough in `docs/demo-script.md`. `backend/evals/results/latest.json` holds the latest end-to-end eval run (7 of 7).

Links: [Web app (Vercel)](https://finn-ochre-five.vercel.app) · [Backend health](https://finn-backend-flax.vercel.app/healthz) · [GitHub repo](https://github.com/Yash04dsr/finn) · [AI build history](https://github.com/Yash04dsr/finn/blob/main/docs/ai-build-history.md)

Name
IIT Delhi – 2027

---

## Checklist before sending

- [ ] Durable Render backend URL verified (`GET /healthz` → `research_ready: true`)
- [ ] Vercel web URL opens on phone (mobile data) and desktop in a private window
- [x] GitHub repo: https://github.com/Yash04dsr/finn
- [ ] AI build history exported (Cursor chats)
- [ ] Subject line copied exactly from the brief
