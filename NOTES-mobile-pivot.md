# Client strategy (web-first)

Current position: **Next.js PWA (`frontend/`) is the primary deliverable**, deployed on Vercel and backed by Render.

- `frontend/` — Next.js 15 PWA, Web Push (`sw.js` deep-linking to `/alert/[id]`), streaming SSE chat, `speechSynthesis` brief playback, mobile-first shell with 44px touch targets and safe-area padding. Zero-install access on any phone or desktop browser.
- `mobile/` — Expo SDK 58 (`expo-router`, `expo-notifications`, `expo/fetch`) kept in the repo as an additional native client speaking the identical REST + SSE contract in `docs/ARCHITECTURE.md`.

Why web-first:
- Graders can open a single Vercel URL on phone or desktop without installing Expo Go, dealing with tunnel drops, or configuring a separate client build.
- Every core workflow — finishing the Brief with verdicts, code-computed `promise_check` on results alerts, `/alert/[id]` evidence, `/company/[ticker]` Promise ledger + decision history, and unseen-ticker research with staged progress — lives in `frontend/`.
- Trade-off: on iOS, Web Push notifications require the user to **Add to Home Screen** in Safari (iOS 16.4+), whereas Android/desktop browsers prompt directly.
