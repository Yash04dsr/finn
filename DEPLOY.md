# Deploy guide (free-tier friendly)

**A brief you finish, graded against management's own words.**

FINN's primary deliverable is the Next.js PWA (`frontend/`) deployed on Vercel, backed by the FastAPI service (`backend/`), also on Vercel.

Live: web app https://finn-ochre-five.vercel.app · backend https://finn-backend-flax.vercel.app/healthz

## Backend on Vercel (current deployment)

Project `finn-backend`, Root Directory `backend`, function region `bom1` (Mumbai: close to BSE and the model gateway).

1. Config lives in `backend/vercel.json` (FastAPI preset, `maxDuration` 300) and `backend/pyproject.toml` (`[tool.vercel]` entrypoint and build script).
2. The build runs `backend/build_db.py`: it downloads the issuer-hosted corpus, grades the sample-day results calls and loads the sample day into `data/finn.db`, which ships in the read-only bundle. Each instance copies it to `FINN_DB_PATH` on cold start, so every instance serves the same brief. `.github/workflows/daily-backend-rebuild.yml` calls a Vercel deploy hook (repo secret `VERCEL_BACKEND_DEPLOY_HOOK`) daily so the sample day stays inside the 24-hour window.
3. Env vars: `HYDE_API_KEY`, `HYDE_BASE_URL`, `FINN_MODEL_FAST`, `FINN_MODEL_REASONING`, `FINN_ALLOWED_ORIGINS`, `FINN_DB_PATH=/tmp/finn.db`, `FINN_PDF_DIR=/tmp/finn-docs`, `XDG_CACHE_HOME=/tmp/.cache`, `FINN_VAPID_PUBLIC_KEY`, `FINN_VAPID_PRIVATE_KEY` (fixed keys so push subscriptions survive cold starts), `FINN_WARM_LEDGER=0` (ledgers are graded at build time).
4. State written at runtime lives in `/tmp` per instance: verdicts, push subscriptions and on-demand coverage of new tickers are not shared between instances and reset when one is recycled. The scheduler is off on Vercel (`VERCEL=1`). For a single persistent process, use the Render blueprint below.
5. Redeploy: push to `main` (Git-connected), or `cd backend && npx vercel@latest deploy --prod`.

## Backend alternative (Render free tier — or Railway/Fly equivalently)

1. Push this repo to GitHub.
2. Render → New → Blueprint → point at the repo (uses `backend/render.yaml`).
3. Set `HYDE_API_KEY`, `FINN_ALLOWED_ORIGINS` (include your Vercel URL) and the two `FINN_VAPID_*` keys in the dashboard, then point the frontend's `FINN_BACKEND_URL` at the Render URL.
   - Optional: set `FINN_PRICE_FAST_IN`, `FINN_PRICE_FAST_OUT`, `FINN_PRICE_REASONING_IN`, `FINN_PRICE_REASONING_OUT` (USD per 1M tokens) if you want per-answer cost shown in chat.
4. The build runs `build_db.py` (corpus, ledgers, sample day). To refresh the sample day later, hit `POST /api/demo/run` once (or use **Settings → Load the sample day** in the app) to populate the feed.
   - The SQLite DB is ephemeral on the free tier; startup restores the verified research corpus and the demo pipeline is idempotent.
5. Verify: `curl https://<backend-url>/healthz` → `research_ready: true`.

## Web app — Primary deliverable (Vercel)

1. Vercel → New Project → import the repo.
2. Root Directory: `frontend` (uses `frontend/vercel.json`).
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
