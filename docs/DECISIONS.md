# Decisions: the calls we made, and the ones we did not

**A brief you finish, graded against management's own words.**

The brief grades judgment, so the reasoning is here in the open.

## Who it is for, and what follows from that

The user is a portfolio manager at a lean, concentrated, long-horizon fund. They hold 15 to 20 companies they know well, and they protect the thesis for each. Three product beliefs follow:

1. **Alerts are thesis checks.** An item says which watchpoint it touches. A routine filing is a count, not a card.
2. **The brief has an end.** Success is a finished decision on each material item, not time in the app.
3. **Management is analysed, not summarised.** Promised versus delivered, cited on both sides, is the company view.

## Key trade-offs

### Web-first PWA (`frontend/`) over Expo (`mobile/`) as primary
We initially built an Expo app (`mobile/`) for native phone testing, then made the Next.js PWA (`frontend/`, deployed on Vercel) the primary deliverable. A single Vercel URL works on phone and desktop with zero install and no tunnel drops. `mobile/` remains in the repo as an additional native client speaking the same API. The trade-off is that iOS Web Push requires **Add to Home Screen** in Safari (iOS 16.4+).

### Brief, verdict, dig in, instead of a feed or a chat box
A feed asks the investor to do the filtering. A chat box makes them think of the question. The brief asks for one decision at a time and remembers it (with an optional one-line reason). Chat is the second layer, opened on the exact filing with questions written for that item.

### Code decides; models read and write
Numbers, `promise_check` (guided band vs. delivered), ranking, verdict grading in the ledger, routing, and citation checks are plain Python with tests. Models classify ambiguous filings, extract guidance, write short lines, and synthesise research. An investor forgives a dry sentence but not a wrong number.

### Routing decided in code, not by the model
Earlier, a fast "root" agent chose whether to hand a question to the grounded analyst. When it did not, the answer came from model memory and skipped the citation check. Now a company question always reaches the analyst, and the fast assistant only sees portfolio-wide questions.

### Citations checked by the server
A model can write `[S12]` without having read S12. The server keeps only IDs that a tool returned in the same turn and holds back research answers with none. It also sends structured sources the app can open.

### Two tiers on one model
The key permits one model (`hyde/glm-5.3-flash`). Rather than pretend, the fast tier turns the model's reasoning down (`reasoning_effort=low`): same answers on bulk jobs, about a ninth of the output tokens. The architecture accepts a second model per tier without code changes (`FINN_MODEL_FAST`, `FINN_MODEL_REASONING`).

### Executive background from the filing, not LinkedIn
SEBI LODR requires an appointment filing to include a brief profile of the appointee, so FINN reads that profile. It is primary, citable, and does not break any site's terms. The annual report is the fallback. Scraping LinkedIn directly breaks its terms and gets blocked.

### Sample day, clearly labelled
A demo needs a busy day; a live Sunday has none. The sample day loads only when asked for, every item is labelled, and live filings never mix with it. Earlier builds re-dated fixtures as if they were live; that was removed.

### SQLite and BM25 over a vector database
The corpus per company is small and lexical. BM25 with an any-word fallback returns precise, citable passages with no extra infrastructure.

## Deliberately left out

- **Pre-results prep card**: a natural next step, cut so the core brief + promise check loop stays sharp.
- Buy, sell, or hold calls and price targets.
- News and broker notes on the research side.
- A full thesis editor. Watchpoints are a short list, drafted from management's own promises.
- Accounts and multi-user state. This is one investor's workflow.
- Intraday prices.

## Where it goes next

1. Pre-results prep card ahead of scheduled earnings.
2. A second model for the reasoning tier, then measure answer quality against cost per question.
3. A weekly "kept versus missed" review across the whole portfolio from the ledger.
