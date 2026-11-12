# Deploy guide (free-tier friendly)

## Backend (Render free tier — or Railway/Fly equivalently)

1. Push this repo to GitHub.
2. Render → New → Blueprint → point at the repo (uses `backend/render.yaml`).
3. Set `HYDE_API_KEY` and `FINN_ALLOWED_ORIGINS` in the dashboard.
4. The build ingests issuer-hosted Persistent/Crompton PDFs. After first boot, hit
   `POST /api/demo/run` once to populate the feed.
   - The SQLite DB is ephemeral on the free tier; startup restores the verified
     research corpus and the demo pipeline is idempotent.
5. Verify: `curl https://<backend-url>/healthz` → `research_ready: true`.

Authenticated alternative: deploy `backend/` as its own Vercel FastAPI project. Set
`HYDE_API_KEY`, `FINN_DB_PATH=/tmp/finn.db`, and `FINN_ALLOWED_ORIGINS`. This is useful
for a grading preview but remains ephemeral serverless storage; Render is preferred
for the scheduled job.

## Expo app

Two paths:

**A. Fastest (recommended for grading): Expo Go**
1. `cd mobile && npx expo start --tunnel` (tunnel = works across networks).
2. Grader scans the QR with Expo Go → app runs against the deployed backend.
3. In-app Settings → set Backend URL to the deployed backend URL.

**B. Published update (no dev server needed)**
1. `npx expo login` then `npx eas update --branch production` (requires a free EAS
   account, `npx eas init` first).
2. Share the update link / QR. Push notifications require an EAS project ID and a
   development/preview build; Expo Go cannot guarantee remote push support.

**Native build (optional)**: `npx eas build --profile preview --platform android`
produces an installable APK; iOS needs an Apple developer account ($99) — skip for
the challenge, Expo Go covers it.

## Web fallback (Vercel)

1. Vercel → New Project → import the repo.
2. Root directory: `frontend/` (or use the repo-level `vercel.json`).
3. Env var: `FINN_BACKEND_URL=https://<backend-url>` (consumed by the `/api` rewrite
   in `next.config.ts`).
4. Deploy → share the URL; it's installable as a PWA from mobile Safari/Chrome.

## Post-deploy smoke test (from phone, on mobile data)

1. Feed renders the digest (or shows the friendly backend-down card → fix URL in Settings).
2. Settings → "Run demo pipeline" → toast shows mode `live` or `snapshot`.
3. Chat: "What guidance did Persistent give for FY26?" → cited answer streams.
