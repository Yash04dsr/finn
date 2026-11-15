# Backend promise check

Cursor agent transcript `6e1cea73-04dc-4f8c-8517-ae348a33e0ba` for this repo (FINN).
User and assistant messages are in order. Tool arguments are left out; each tool is one line.
Started Sunday, Nov 15, 2026, 7:57 PM (UTC+5:30).
2 system ticks that were only a timestamp, with no message, are left out.

---

**User** — Sunday, Nov 15, 2026, 7:57 PM (UTC+5:30)

Repo: /Users/yash/Desktop/Sem 9/Enam Holding ass (FINN, an investor-monitoring app for the ENAM AI Engineer challenge). Backend is FastAPI in backend/finn (Python venv at repo root .venv; check backend/ for pyproject/uv usage and existing tests). Read the full plan at /Users/yash/.cursor/plans/web-first_finn_transformation_4e0ead4b.plan.md, and PRODUCT.md for voice/principles. You own ONLY step 1 (backend promise check). A separate agent is concurrently editing frontend/ — do NOT touch frontend/ or mobile/.

Goal: every results alert in the brief shows management's earlier guidance vs what was delivered, computed deterministically in code (never by an LLM), with both sides cited.

Tasks:
1. In backend/finn/brief.py, draft_from_ledger currently calls add_watchpoint(..., None, None, chunk, 'drafted') — band only stored as text. Populate numeric lo/hi from the ledger row (see backend/finn/tools/ledger.py: grade, _band, claim structure). Also handle existing DBs where drafted watchpoints have null lo/hi (e.g. recompute from ledger lazily, or migrate on startup) — the deployed DB is ephemeral SQLite restored at startup, so make sure the demo path (POST /api/demo/run, startup restore) yields populated bounds.
2. Add promise_check(alert, points) -> dict | None in brief.py. For alerts whose payload.category == 'results' with payload.facts.rows (labels like Revenue, EBITDA, PAT with value, yoy_pct; inspect real payload shape in db/snapshots and pipeline), match the metric to the watchpoint kind (revenue_growth -> Revenue yoy_pct; ebitda_margin -> EBITDA/Revenue margin computed in code; ebit_margin / pat_margin similarly if data allows). Return exactly this contract (frontend depends on it):
   {"metric": str (plain label e.g. 'EBITDA margin'), "guided_band": str (e.g. '15-16%'), "guided_lo": float|null, "guided_hi": float|null, "guided_period": str (call period e.g. 'Q4 FY25'), "guided_source": {source_id, title, url, excerpt}|null, "delivered": float|null, "delivered_period": str|null, "delivered_source": {title,url}|null (the results filing), "status": 'kept'|'missed'|'no_guidance'|'not_reported', "note": str (one plain sentence, e.g. 'EBITDA margin 14.2% in Q2 FY26 against 15-16% guided on the Q4 FY25 call.'), "is_illustrative": bool}
   Return None for non-results alerts. If facts are sample/illustrative (payload.is_sample or facts.is_illustrative), set is_illustrative true and keep the label honest — never present sample numbers as real outcomes.
3. Attach 'promise_check' to every item in brief() and to GET /api/alerts/{id} in backend/finn/api/main.py.
4. Unit tests (find existing test layout; create backend/tests if none) covering kept, missed, no_guidance, and non-results -> None. Run them plus any existing tests and make sure they pass. Also start the API briefly (uvicorn finn.api.main:app) and curl /api/demo/run then /api/brief to confirm promise_check appears on results items; stop the server after.
5. Style: match surrounding code (terse docstrings, deterministic, no new deps). No comments narrating changes.

Return: files changed, the exact JSON of one real promise_check from /api/brief output, test results, and any caveats (e.g. metrics that couldn't be matched).

**Assistant**

I'll read the plan, then the backend code involved (brief, ledger, API, existing tests).

I'm going to begin by reading the plan and the relevant files.

*Tool: UpdateCurrentStep — Reading plan and backend code*

*Tool: Shell — ran a command*

*Tool: Read — read backend/finn/brief.py*


**Assistant**

*Tool: Read — read backend/finn/tools/ledger.py*

*Tool: Read — read backend/tests/test_brief.py*

*Tool: Grep — searched for draft_from_ledger|brief\.|def demo|startup|restore|alerts/\{*


**Assistant**

The ledger rows lack the lo, hi, and unit fields, so I'll need to add them to the grade rows. The band string "16 to 17%" could serve as a fallback to parse those values. Next I'm opening main.py to see how the rows are built.

*Tool: Shell — ran a command*


**Assistant**

*Tool: Read — read backend/finn/api/main.py*

*Tool: Read — read backend/finn/api/main.py*

*Tool: Read — read backend/finn/alerts/enrichers.py*


**Assistant**

Now the pipeline and the real payload shapes in the current DB.

*Tool: Read — read backend/finn/pipeline.py*

*Tool: Shell — ran a command*


**Assistant**

I'm checking which facts are present for each company: HDFC has some but lacks the "is_illustrative" and "source" keys, Bharat Forge has none, and most of the demo results alerts are missing facts too. Next I'll look at the snapshots and the first_cut metrics, and I'm puzzled by the "Q2FY27" period. My main question is where the demo watchpoint originates, since watchpoints only get drafted when the ledger endpoint is hit.

I'm thinking about whether the demo path can show populated bounds when results alerts have no watchpoints. One option is to read already-graded claims from guidance_claims directly in promise_check, without calling the LLM, through a small synchronous helper. I still need to check what claims are stored and how the DB is restored at startup.

*Tool: Shell — ran a command*


**Assistant**

I'm checking whether the demo has watched tickers, and I want to see the portfolio, sample announcements, and which tickers have results alerts. I also need to find where the deployed database gets restored at startup, so I'll look in DEPLOY.md and db.py, and check whether the data/finn.db file is committed.

*Tool: Shell — ran a command*


**Assistant**

The database isn't tracked in git, so a fresh deploy starts with no guidance claims at all, and without a ledger every bound would come back as `no_guidance`. I want to check DEPLOY.md and the config to see what the startup restore actually does.

I'm weighing how the demo path gets populated bounds after a fresh deploy. One option is to build the ledgers for the watched tickers during the demo run, cached per document, though that costs LLM calls. Another is to pre-seed guidance claims from a snapshot file. Before choosing, I want to check what DEPLOY.md says about the startup restore.

*Tool: Shell — ran a command*


**Assistant**

I'm checking whether the bundled database, backend/data/finn.db, is gitignored, since git ls-files didn't list it. I'll look at DEPLOY.md lines 5-20 and the .gitignore to see how the database gets to the deployed app.

*Tool: Shell — ran a command*


**Assistant**

Since Render's database is ephemeral, the corpus gets re-ingested at startup from the official docs. Guidance claims still need LLM extraction, so the demo run should build LLM-backed, cached ledgers for tickers that have results, alerts, and draft watchpoints. I'm considering adding that step to api_demo_run after run_pipeline, since the ledger endpoint already uses build_ledger.

I'm weighing whether to add a best-effort step in the demo run that builds cached, LLM-backed ledgers for tickers with results alerts and drafts their watchpoints, accepting some added latency. I'm also considering a helper in brief.py instead, and a backfill for existing databases that fills null bounds by parsing the watchpoint text or pulling from guidance claims.

I'm going to read the rest of the bounds logic as a fallback: when a watchpoint's stored lo/hi is null, I can parse the percentage range out of its text, and a one-time startup backfill can fill the stored values for existing rows. I also need ledger rows to carry lo, hi, and unit so the drafted watchpoints line up.

I'm settling on the ledger rows carrying lo, hi and unit, so the drafted watchpoints can use the stored bounds. I'll have the band parsed into numbers when a row doesn't already have them, and only treat it as a percentage when the unit says so. I also noticed the draft is currently picking up revenue growth in billions, which reads wrong, so I'm planning to limit drafting to percentage bands.

I'm checking how a watchpoint's guidance period gets recorded, since the schema has no period column. Parsing it from text like "on the Q2FY27 call" is one option, and pulling it from the source chunk's period is another.

I'm working out how to tie the guided period and excerpt to each drafted watchpoint, since the schema has no period column. The excerpt can come from the guidance claim for that chunk and kind, falling back to the chunk text. For the period, I'm thinking the claim's period comes first, then a text parse, then the chunk's period.

I'm working out how to compute the delivered margins: EBITDA margin as EBITDA over revenue, PAT margin as PAT over revenue. EBIT margin can't come from the facts rows since depreciation isn't there, so I'm considering pulling it from the quarterly series for the facts period instead. I'm also noticing the results payload is flagged as sample data, and the first-cut metrics feeding the demo pipeline come from the live screener quarter for this ticker.

I'm checking whether a watchpoint's call period lands before or after the delivered period, since guidance about a future quarter shouldn't be scored against results that already came out. The note will also start with "Illustrative only." because the alert is sample data, even though the screener numbers look real.

I'm realizing that comparing the delivered quarter against guidance from that same call is wrong, so the promise check should use the newest guidance claim of the matching kind with a percent unit whose period comes before the delivered one. Watchpoints only keep one row per kind, so reading straight from the cached guidance claims seems more reliable than going through them.

Checking whether the alert's guidance would be scored against results already out: if a watchpoint's call period comes before the delivered quarter, it can be used; otherwise I'd need an earlier guidance claim from the claims table. Looking at Persistent's claims, the EBITDA margin guidance from Q4FY26 would cover the Q2FY27 delivery, so relying only on watchpoints would leave the demo with nothing to score. I'm now wondering how the fresh-deploy path handles that.

I'm sketching a `_guidance` helper that collects candidate guidance for each kind, both from the watchpoints with bounds and from the guidance claims, and filters them to percentage ranges with a period before the delivered quarter.

I'm settling on how the demo run gets its guidance: a best-effort warm-up builds the ledgers and drafts watchpoints before the promise check runs. The check will look at all candidate guidance, both stored watchpoints and the cached guidance claims, keep only ranges dated before the delivered quarter, and take the most recent one.

I'm going to check whether the test suite calls the demo run endpoint, since an LLM-backed ledger build there could be slow or hit the network. For each results alert I'll try the metrics in order (EBITDA margin, EBIT margin, revenue growth, PAT margin): the first one with guidance and a computable delivered value gives kept or missed, guidance without a delivered value gives not_reported, and if there's no guidance at all I'll fall back to whichever metric is computable.

I'm settling the guided band format as a range like "16-17%" and the period label as "Q4 FY25", so a note reads naturally. For the status, a delivered value at or above the lower bound counts as kept, matching how the ledger grades results, and anything below it as missed. The delivered source will come from the results filing's title and URL.

I'm checking the delivered-period source next: the results filing chunk for that ticker and period can supply the URL and title, falling back to the alert's own filing URL or headline. If the facts row is missing, the status depends on whether any guidance exists, and the alert still gets a result entry.

I'm going to compute the delivered EBITDA, PAT, and revenue-growth figures from the facts rows, and get EBIT margin from the quarterly series since depreciation isn't in the facts. Then I'll check the test suite for any demo-run calls that could trigger slow LLM work.

*Tool: Shell — ran a command*


**Assistant**

I'm going to add the warm-up to the demo endpoint after run_pipeline, guarded the same way as elsewhere, with logging and a timeout. The ledger build might take 10 to 20 seconds, and since the user triggers it, I'm weighing whether to background it or block on it with asyncio.wait_for so the next brief has guidance ready.

I'm working out where the warm-up goes in the demo run, and whether to block on it with a timeout or schedule it in the background. I'm leaning toward blocking with a 45-second asyncio timeout, limited to tickers with results alerts and no claims yet, so the brief has guidance ready right after.

Next I'm extending the backfill so it also fills numeric bounds for drafted watchpoints saved before those bounds were stored.

Still writing the backfill helper...

Now I'm extending the guidance candidates to pull claims for each kind, using the stored lo/hi with a fallback parse of the watchpoint text.

Working out how the claim candidates are chosen for the guidance: I'll keep only those from periods earlier than the delivered one, take the latest, and break ties in favor of the stored watchpoint points. For the excerpt, I'll use the claim's quote, or look one up by chunk, and fall back to the chunk text.

Now I'm working out how the delivered-period value is computed per kind, pulling the revenue row from the facts to anchor the growth comparison.

Now I'm working out how the delivered-period value is computed for each kind: growth comes straight from the YoY figure on the revenue row, the EBITDA and PAT margins are divided by revenue, and the EBIT margin comes from the quarterly series for the matching period.

I'm settling on how to pick the headline metric: I'll walk the metric kinds in order and take the first one that has both guidance and a delivered value. If none has both, I'll fall back to guidance alone, then to a delivered value alone, and decide what label to use when neither exists.

Weighing the not-reported case: the guidance band and its call period go into the note, and the delivered period is either named or the latest available. Next I'm writing the not-reported sentence so it says the guided metric is absent from the filing, with the band and call period inline.

I'm adding a helper that fills numeric bounds on drafted watchpoints saved before those bounds were stored, using a text parse when the stored values are missing. I'm also checking how the illustrative-sample prefix should read before I settle on the note wording.

Next I'm checking whether the repo already has a period-formatting helper for display, searching the brief and digest code for an existing "FY" style function before I write a new one.

*Tool: Shell — ran a command*


**Assistant**

I'm checking whether `_op_lock` is reentrant, since `_source` opens `db()` and nesting it inside another `with db.db()` would deadlock on a plain Lock, so I'll avoid that nesting. Then I'm moving on to `ledger.py` to add lo/hi/unit to the grade rows.

*Tool: UpdateCurrentStep — Implementing promise check in brief*

*Tool: StrReplace — edited backend/finn/tools/ledger.py*


**Assistant**

I'm checking the test_ledger tests for exact dict equality on the rows, using grep to find them.

*Tool: Shell — ran a command*


**Assistant**

Now the brief.py changes: numeric bounds on drafting, a startup backfill, and `promise_check`.

*Tool: StrReplace — edited backend/finn/brief.py*

*Tool: StrReplace — edited backend/finn/brief.py*


**Assistant**

I'm checking that the ledger's `_band` gives "5 billion" for non-percent units, and that the drafted `_row_bounds` handles unit the same way. The test rows have no unit, so the "50 billion" band is the kind that LABELS skips. That's fine. Next I'm moving on to placing promise_check after touches().

*Tool: StrReplace — edited backend/finn/brief.py*


**Assistant**

I'm going to drop the illustrative-prefix workaround and use a simpler version: a plain "Illustrative sample, not a real outcome." label followed by the note. That keeps the capitalization intact, so I'll make that change.

*Tool: StrReplace — edited backend/finn/brief.py*


**Assistant**

I'm weighing whether a prefixed label would make the note two sentences, since the contract asks for one plain sentence. Lowercasing the note's first letter would mangle "EBITDA," so I'm considering keeping the original casing and just prefixing it with "Sample data:".

I'm settling on "Illustrative:" as the prefix, since it reads naturally and keeps the note to a single sentence, with the original casing left intact.

*Tool: StrReplace — edited backend/finn/brief.py*


**Assistant**

I'm checking the ranking logic: guided-only should outrank delivered-only, and the iteration order still picks the right combo when a delivered-only margin competes with a guided-plus-delivered growth figure. I'm also noting that the `_guided_source` fallback indexes the result the same way whether it's a sqlite Row or a dict, so that part is fine. Next I'll wire this into `brief()` and the API, and look at how `points` is handled there.

I'm checking whether the `points` value in `brief()` is cached as `points_cache`, and I'll add the `promise_check` key alongside it.

*Tool: StrReplace — edited backend/finn/brief.py*

*Tool: StrReplace — edited backend/finn/api/main.py*

*Tool: StrReplace — edited backend/finn/api/main.py*


**Assistant**

*Tool: Read — read backend/finn/api/main.py*


**Assistant**

*Tool: StrReplace — edited backend/finn/api/main.py*

*Tool: StrReplace — edited backend/finn/api/main.py*


**Assistant**

The drafted watchpoint is already in the dev DB as a persistent EBITDA margin item (16 to 17%, from the Q2FY27 guidance), and since the draft is "once", it won't update, which is fine. Next I'm writing tests in test_brief.py, so I need to check the guidance_claims columns and the helper for inserting chunks as the source.

*Tool: Shell — ran a command*


**Assistant**

*Tool: Read — read backend/finn/db.py*


**Assistant**

Now the tests.

*Tool: StrReplace — edited backend/tests/test_brief.py*


**Assistant**

I'm checking the not_reported case: EBITDA has no delivered value but guidance exists, so it ranks 2, while the other metrics don't beat that, making the best rank 2 and the result not_reported. Then for the PCS test, EBITDA at 14.2 and revenue growth both rank 1, and the first one wins under the strict comparison.

I'm running the test suite now to confirm both cases pass.

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

All the tests pass, including the 9 new ones. Next is a live run, and I'm weighing whether to use a copy of the dev DB, since the demo already mutated data/finn.db. Running against the dev DB is the normal flow, and the warm-up will call the LLM, so I need to confirm the .env has keys. I also need a free port and should check the terminals for any servers already running.

*Tool: UpdateCurrentStep — Verifying against live API*

*Tool: Shell — ran a command*


**Assistant**

I'm going to use port 8011 instead, since something is already running on 8000, possibly another agent or user's server. Both can share the same database because SQLite in WAL mode handles concurrent access fine. I'll start uvicorn in the background on 8011.

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

The startup ran past six seconds, but the service is up now, so I'll retry the request.

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

I suspect the server died when the shell call finished, since it was probably a background job tied to that session. I'll launch it with nohup or set block_until_ms to 0 so it keeps running.

*Tool: Shell — FINN API on port 8011*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

I'm checking which quarter the alert facts refer to, since the table has Q2FY27 alongside Q2FY26, and the alert payload was stored earlier. The claims at Q4FY26 and Q2FY27 both fall after Q2FY26, so none of them apply to that period.

I'm going to check which transcript periods the ledger actually saw for PERSISTENT, since the manifest listed Q4FY25, Q1FY26, and Q2FY26 while the current claims only cover Q4FY26 and Q2FY27. On the HDFCBANK side, the -5.6% EBIT margin from the series looks wrong for a bank, and I'm considering only using the series fallback when the facts include a non-null EBITDA value.

*Tool: Shell — ran a command*


**Assistant**

I'm checking the data now: the backfill succeeded and watchpoint 3 is at 16 of 17. Some transcript labels look wrong, since the "Q2FY27" Persistent calls may really be FY26 calls with the wrong year, so I'm comparing them against the actual Q2 FY26 results from October 2025.

I'm reconciling the numbers: Persistent's EBITDA margin should be about 16.3%, but the alert facts show 19.2%, which may be because the screener's operating profit includes other income. The ledger's newest four transcripts don't reach back to Q2FY26, so the only earlier quarter on hand is the demo alert's. Since the alert facts look stale, I'm considering how a fresh deploy would pick the latest quarter and guidance.

I'm weighing whether to recompute the facts at promise-check time, and decide not to, since facts belong to the alert. I'll run a separate fresh database at a temp path to simulate a real deploy, which leaves the dev database untouched, even though the startup seeding downloads PDFs and may be slow.

I'm going to fix the HDFC EBIT issue so it only uses the EBITDA from the facts, and I'm weighing whether showing net margin for a bank with no guidance is worth it. It's deterministic, so I'll leave it in.


The Persistent backfill is up to 16 of 17, and HDFC Bank's EBIT margin was wrong from the quarterly fallback. I'm limiting EBIT margin to filings that report EBITDA, then checking on a fresh DB.

*Tool: StrReplace — edited backend/finn/brief.py*

*Tool: Shell — ran a command*


**Assistant**

Now a fresh-DB run that mirrors the Render deploy (empty SQLite, startup seeding, then demo run).

*Tool: Shell — FINN API on fresh DB*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

I've got a real "kept" check for Crompton now, using bounds from the fresh deploy path, and 15 of 18 watchpoints have bounds populated. For HDFCBANK, the EBITDA margin of -5.8% is coming from the enricher, and for a bank that number is not meaningful. The question is whether to hide it, since this is a no_guidance case.

I'm weighing whether to hide the HDFCBANK EBITDA margin of -5.8%, since for a bank that figure isn't meaningful and this is a no_guidance case. Hiding it on negative EBITDA would wrongly drop real losses, and detecting banks feels hacky. A cleaner fallback is to prefer revenue growth as the delivered fact when there's no guidance, since it applies to any company, and I'm thinking about how to restructure the candidate ranking to break ties that way.

I'm going to rank the candidates by how many of the guided and delivered values they have, and break ties so that revenue growth wins when there's no guidance, then rerun the tests. The brief is built at request time, so the server needs a restart to pick up the change, but the existing database can stay as it is.


The fresh deploy path now works: Crompton gets a real "kept" check and its watchpoint stores 15/18. For banks without guidance I'll report revenue growth instead of EBITDA margin, since bank EBITDA is meaningless.

*Tool: StrReplace — edited backend/finn/brief.py*

*Tool: StrReplace — edited backend/tests/test_brief.py*

*Tool: Shell — ran a command*


**Assistant**

*Tool: Shell — FINN API on fresh DB*


**Assistant**

*Tool: Shell — ran a command*


**Assistant**

Step 1 is done. Results alerts in the brief now carry a `promise_check` that is worked out in code. It is also returned by `GET /api/alerts/{id}`. All 109 backend tests pass (9 are new), and a live run on a fresh database set up like the deploy produced a real "kept" check for Crompton. I didn't touch `frontend/` or `mobile/`.

**Files changed**
- `backend/finn/brief.py`:
  - Drafted watchpoints now store numeric `lo`/`hi`. Only percentage bands are drafted; before, "Revenue growth 5 billion" could slip in.
  - New `backfill_bounds()` fills bounds for existing drafted rows that only have the band as text.
  - New `draft_for_results()` grades the calls behind each results alert and drafts its watchpoints.
  - New `promise_check()` and its helpers, attached to every item in `brief()`.
- `backend/finn/tools/ledger.py`: ledger rows now also include `lo`, `hi` and `unit` (an added field, nothing removed).
- `backend/finn/api/main.py`:
  - Startup runs `backfill_bounds()`.
  - `POST /api/demo/run` then runs `draft_for_results()`. It skips this under the test database and logs failures instead of failing the run.
  - `GET /api/alerts/{id}` returns `promise_check`.
- `backend/tests/test_brief.py`: tests for kept, missed, no guidance, not reported, non-results returning `None`, sample labelling, guidance from the same call being ignored, the backfill, and drafted bounds.

**How guidance is picked:** it uses the newest percentage band for the metric from a call before the reported quarter. Candidates come from watchpoints and the cached graded claims; guidance from the same call or a later one is never used. If several metrics have both sides, the order is EBITDA margin, EBIT margin, revenue growth, then net margin. "Kept" means delivered is at or above the low end, the same rule the ledger uses.

**One real `promise_check` from `/api/brief`** (fresh database, after `/api/demo/run`):
```json
{
  "metric": "Revenue growth",
  "guided_band": "15-18%",
  "guided_lo": 15.0,
  "guided_hi": 18.0,
  "guided_period": "Q1 FY26",
  "guided_source": {
    "source_id": "S701",
    "title": "Crompton Q1 FY26 Earnings Conference Call",
    "url": "https://reports.crompton.co.in/shopify/public/files/C39QR7BfnW_Transcript%20of%20earning%20call.pdf",
    "excerpt": "It has got a trajectory of growing at about 15% to 18% and we are continuing on that."
  },
  "delivered": 18.1,
  "delivered_period": "Q2 FY27",
  "delivered_source": {
    "title": "Crompton Greaves Consumer Electricals Ltd -Declaration of Audited Financial Results for the quarter and half year ended September 30, 2025",
    "url": null
  },
  "status": "kept",
  "note": "Illustrative sample: Revenue growth 18.1% in Q2 FY27 against 15-18% guided on the Q1 FY26 call.",
  "is_illustrative": true
}
```
The other five results items (Persistent, HDFC Bank, Bharat Forge, Neuland, Titan) came back `no_guidance`, each showing reported revenue growth. The server was stopped afterwards. The run used `/tmp/finn_pc.db`; an earlier run against the dev database only filled in bounds on the one existing Persistent watchpoint.

**Caveats**
- **Quarter mismatch in sample alerts:** the results numbers are built from the latest stored quarter (Q2 FY27), but the sample filing's headline is for Q2 FY26. So in the Crompton output, the `delivered_source` title and `delivered_period` disagree. That comes from how sample alerts get their numbers in the pipeline, which I didn't change; it should be fixed or the frontend should be careful with that title.
- **Missing filing link:** `delivered_source.url` is often `null`. Sample filings have no link, and there's only a stored results document for some company/quarter pairs.
- **Persistent has no check:** on a fresh deploy all its claims are margin expansion in basis points, which a reported percentage can't be compared against. In the dev database, its 16–17% guidance comes from calls after the alert's quarter, so it's correctly ignored.
- **EBIT margin** is only computed when the filing reports EBITDA; otherwise HDFC Bank showed a meaningless -5.6%. When there's no guidance, revenue growth is shown instead of a margin for the same reason.
- **Demo run is slower the first time:** it now makes model calls to grade transcripts, which added a few seconds here. Results are cached per document after that.
- **Medium-term targets:** a band like Crompton's "trajectory" target is graded against one quarter, the same as the ledger does today.
- **Small contract details:**
  - `not_reported` means guidance exists but the filing can't check it.
  - When there's no guidance, `guided_band` and `guided_period` are empty strings.
  - For sample data, the note starts with "Illustrative sample:".

I'm noting a mismatch: the delivered source is titled for the quarter ended September 30, 2025 (Q2 FY26), but the facts are from Q2 FY27, the latest screener quarter. That comes from the sample-day enricher computing facts from the latest stored quarter regardless of the filing's period. The delivered source URL is also null, since the sample filing has no URL and there's no results_filing chunk for Q2 FY27, so it's worth flagging. I'm also starting on Crompton.

The Crompton "15-18%" figure is a medium-term trajectory, so grading it against a single quarter is generous, and the ledger does the same. The server has stopped, and the tests pass, so I'm treating the py_compile check as covered. I haven't touched the frontend or mobile code.


**User** — Sunday, Nov 15, 2026, 8:03 PM (UTC+5:30)

Briefly inform the user about the task result and perform any follow-up actions (if needed).

**Assistant**

I've already stopped the servers on purpose, so now I'm checking whether I need to call UpdateCurrentStep with a final status, which probably means passing a final_summary. I'll keep the response short.

*Tool: UpdateCurrentStep — Wrapping up verification*


**Assistant**

Those three "finished with error" notices are the test API servers on port 8011. I stopped them myself once verification was done, so the SIGTERM is expected and nothing needs doing. The server you already had on port 8000 wasn't touched, and nothing else is left over to clean up.

My earlier report still stands: all 109 backend tests pass, and on a fresh database the demo run gave Crompton a cited "kept" result. The caveats I listed there haven't changed.
