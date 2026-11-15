# Deploy guide (free-tier friendly)

**A brief you finish, graded against management's own words.**

FINN's primary deliverable is the Next.js PWA (`frontend/`) deployed on Vercel, backed by the FastAPI service (`backend/`) on Render.

## Backend (Render free tier — or Railway/Fly equivalently)

1. Push this repo to GitHub.
2. Render → New → Blueprint → point at the repo (uses `backend/render.yaml`).
3. Set `HYDE_API_KEY` and `FINN_ALLOWED_ORIGINS` (include your Vercel URL) in the dashboard.
   - Optional: set `FINN_PRICE_FAST_IN`, `FINN_PRICE_FAST_OUT`, `FINN_PRICE_REASONING_IN`, `FINN_PRICE_REASONING_OUT` (USD per 1M tokens) if you want per-answer cost shown in chat.
4. The build ingests issuer-hosted Persistent/Crompton PDFs. After first boot, hit `POST /api/demo/run` once (or use **Settings → Load the sample day** in the app) to populate the feed.
   - The SQLite DB is ephemeral on the free tier; startup restores the verified research corpus and the demo pipeline is idempotent.
5. Verify: `curl https://<backend-url>/healthz` → `research_ready: true`.

## Web app — Primary deliverable (Vercel)

1. Vercel → New Project → import the repo.
2. Root directory: leave as repo root (uses the root `vercel.json`, which installs and builds `frontend/` cleanly).
3. Env var: `FINN_BACKEND_URL=https://<backend-url>` (consumed by the `/api/:path*` rewrite in `frontend/next.config.ts`).
4. Deploy → share the URL; it works immediately on desktop and mobile browsers with zero install, and is installable as a PWA from mobile Safari/Chrome.
   - **iOS Web Push**: requires **Add to Home Screen** in Safari (iOS 16.4+).

## Additional native client: Expo app (`mobile/`, optional)

Kept in the repo for native testing against the same backend:

1. `cd mobile && npx expo start --tunnel`
2. Scan the QR with Expo Go and set Backend URL in **Settings** to `https://<backend-url>`.

## Post-deploy smoke test (from phone, on mobile data)

1. Open the Vercel URL: the Brief loads (or use **Settings → Load the sample day** if empty). Note that a cold Render free-tier backend can take ~30–50 seconds on the first request.
2. **Finish the Brief**: inspect a results card with its inline **PromiseCheck**, record a verdict (`No impact`, `Watch closer`, or `Changes the story` with a note), and verify `/alert/[id]` opens with both citations.
3. **Promise Ledger**: open a company page (`/company/PERSISTENT`) and verify the Promise ledger and decision history appear at the top.
4. **Unseen ticker**: ask in **Ask** (`/chat`) about an unseen NSE/BSE ticker (for example, `VEDL` or `ITC`) and verify staged progress + primary-source citations stream back.
