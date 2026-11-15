# Covering note

**To:** assessment@enam.com
**Subject:** IIT Delhi – AI Engineer - 2027

Dear ENAM team,

The app is https://finn-ochre-five.vercel.app. The repo is https://github.com/Yash04dsr/finn.

A brief you finish, graded against management's own words.

I built FINN for the investor in your brief. A small team holds 15 to 20 Indian listed companies and lives with the decision. In the morning they need to know if anything they own changed. Once a quarter they need to know if management did what they said. NSE publishes roughly 900 to 1,500 announcements a day, and most of them are paperwork. One results filing and its call take 30 to 60 minutes. FINN finishes that check in about two minutes.

It is a mobile-first website. The link opens on a phone. There is nothing to install.

Push is the brief. You pick the window. Items that need a decision come one at a time. Each one names the watchpoint it touches and recalls your last verdict on a similar filing. Routine filings are a count. You mark No impact, Watch closer, or Changes the story, and you can add one line. When the window is decided, the screen says you are done. On a results item, revenue, EBITDA, and PAT versus last year are calculated in code. The promise check is code too. It sets the number in this filing against the band management guided on an earlier call, and it keeps both sources. It marks the promise kept or missed, and it says when the filing left the figure out or management never gave a number.

Pull is a question on any NSE or BSE ticker, including one FINN has never seen. It fetches the quarterly table, finds the newest call transcripts, or the latest annual report when the company holds no calls, and answers only from those pages. ITC is the case with no calls. The server drops any citation it did not read. If there is no primary document, the answer says so. A buy, sell, or hold request, and any question that is not about the company, gets one sentence. No news, and no broker notes. I read an incoming executive's background from the appointment filing. SEBI already requires a short profile there.

Every model call goes through Hyde, at https://inference.hyde.tech/v1. Both the fast tier and the reasoning tier are the open-weight model GLM-5.3-Flash, configured as `hyde/glm-5.3-flash`. The weights are published under the MIT license. This key allows that one model, so the tiers differ by how much it is allowed to think. Classification, guidance extraction, one-line summaries, and the executive profile run with reasoning turned down. Research synthesis uses full reasoning. On the same three bulk jobs the fast setting used 68 output tokens and full reasoning used 607, with the same answers. Guidance is extracted once per document. A research answer is reused at zero tokens until that company's documents or numbers change. Each chat answer shows its tier, token count, and cost when a price is set. Numbers, ranking, and the promise grade stay in code.

I made the website the thing to grade. The Expo app is still in the repo and talks to the same API. One link works on a phone and a laptop. On iOS 16.4 and later, a notification needs Add to Home Screen in Safari before it can be delivered. The API runs on Vercel as a serverless function, so the SQLite file on the instance does not last. Verdicts, the investor's own watchpoints and settings, and documents read on demand are stored in Neon and loaded when a new instance starts.

I cut a pre-results prep card, buy and sell calls, news, broker notes, accounts for more than one person, and intraday prices. Next I would add the prep card before earnings, try a second Hyde model on the reasoning tier and measure quality against cost, and show promises kept across the book once a week.

If the brief is empty, open Settings and load the sample day. It is labelled, and it is not live filings. The build history is in the repo at `docs/ai-build-history.md`.

Yash Sakhare
IIT Delhi, 2027
