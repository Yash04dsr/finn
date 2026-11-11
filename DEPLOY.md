# Deploy guide (free-tier friendly)

## Backend (Render free tier — or Railway/Fly equivalently)

1. Push this repo to GitHub.
2. Render → New → Blueprint → point at the repo (uses `backend/render.yaml`).
3. Set `HYDE_API_KEY` in the dashboard (Secret File or env var).
4. After first boot, hit `POST /api/demo/run` once (curl or the app's Settings button)
   to build the SQLite demo DB from the bundled snapshots.
   - The DB is ephemeral on the free tier; the seeder makes that a non-issue.
5. Verify: `curl https://<backend-url>/api/settings` → thresholds JSON.

## Expo app

Two paths:

**A. Fastest (recommended for grading): Expo Go**
1. `cd mobile && npx expo start --tunnel` (tunnel = works across networks).
2. Grader scans the QR with Expo Go → app runs against the deployed backend.
3. In-app Settings → set Backend URL to the deployed backend URL.

**B. Published update (no dev server needed)**
1. `npx expo login` then `npx eas update --branch production` (requires a free EAS
   account, `npx eas init` first).
2. Share the update link / QR; it opens in Expo Go without any dev server.

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
