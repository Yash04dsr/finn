# FINN web fallback (Next.js PWA)

Primary client is the Expo app in `../mobile`. This PWA is the no-install fallback:
same API contract, same design language.

```bash
npm install
npm run dev        # http://localhost:3000 — proxies /api/* to the backend :8000
```

Set `FINN_BACKEND_URL` to override the backend target (used by the rewrite in
`next.config.ts`).
