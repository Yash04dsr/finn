# Covering email — draft

**To:** assessment@enam.com
**Subject:** IIT Delhi – AI Engineer - 2027

---

Dear ENAM team,

**What I built.** FINN — a mobile-first investment agent that runs the daily loop a
lean public-markets investor actually lives: a **Push** side that tells you what changed
across your portfolio and why you should care, and a **Pull** side that researches only
when verified issuer-hosted evidence is available. Its Persistent and Crompton corpus
contains official annual reports, call transcripts, and results presentations; unknown
coverage produces an explicit refusal rather than an invented answer.

The brief's line that stuck with me was *"the scarce skill is not aggregating
information. It's filtering it."* So FINN's core behaviours are filtering behaviours:
a 24h brief where material events are enriched (results → deterministic QoQ/YoY
first-cut; management change → the incoming person's background) and routine paperwork
is counted, not shown; a threshold engine where **the user defines "unusual"**
(volume ×, price-move %, category watchlist, quiet hours) and every alert carries a
"Why am I seeing this?" explanation; and an analyst that **refuses to answer outside
its sources** — the refusal is tested, not aspirational.

**Key decisions & trade-offs.**
1. *The LLM never does math.* All numbers are computed in tested Python; the model
   narrates them. This trades a little flexibility for the elimination of
   confident-wrong-number failures.
2. *Keywords first, LLM for ambiguity, one batched call.* Deterministic matches cost
   zero tokens; the token-usage ledger shows provider-reported routing telemetry without
   pretending token counts are billed currency.
3. *SQLite + BM25 over a vector DB.* At this corpus size, FTS5 with snippets gives
   precise, citable retrieval with no infrastructure; the retrieval interface is the
   seam where embeddings would go.
4. *Google ADK v2.14 multi-agent*: a fast-tier routing coordinator delegating to a
   grounded ResearchAnalyst via native ADK agent transfer — the agent graph is small
   on purpose.

**What I deliberately left out.** News/broker commentary (primary-only keeps the
grounding contract enforceable), vector embeddings (premature at this corpus size),
full account management (the public demo instead isolates chat sessions and rate-limits
costly endpoints), and real LinkedIn scraping
(ToS-brittle; the enrichment seam is structured and a licensed provider would slot in).

**Where I'd take it next.** Digest memory (diff consecutive briefs: "2 new since
yesterday"), per-user priority learning from read/skip behaviour, expected-vs-actual
first-cuts driven by an earnings calendar, and a voice mode for the commute.

**Trying it.** Scan the Expo QR (Expo Go) or open the web fallback on your phone —
both hit the same API. The repo README has a 2-minute quick start, `docs/demo-script.md`
is a 3-minute walkthrough, and `docs/DECISIONS.md` is the full judgment trail.

Links: [deployed app — still needs a public host] · [GitHub repo](https://github.com/Yash04dsr/finn) · [AI build history]

Name
IIT Delhi – 2027

---

## Checklist before sending

- [ ] Deployed backend URL works from mobile data (not just LAN)
- [ ] Expo app published / QR works on the grader's phone
- [x] GitHub repo pushed: https://github.com/Yash04dsr/finn
- [ ] README quick-start tested on a clean machine
- [ ] AI build history exported (Cursor chats: Settings → export; include this one)
- [ ] All links resolve in incognito
