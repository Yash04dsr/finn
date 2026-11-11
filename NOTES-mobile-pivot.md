# Client strategy (post-pivot note)

Decision made mid-build: the mobile experience is now an **Expo (React Native) app**
(`mobile/`), per the requirement that graders try FINN on a phone natively.

- `mobile/` — Expo SDK 58, expo-router, expo-notifications (Expo push), streaming chat
  via `expo/fetch`. Primary client.
- `frontend/` — Next.js PWA kept as a no-install web fallback (same API contract).
- Backend gained `POST /api/push/subscribe-expo` and Expo-push delivery in
  `finn/alerts/push.py` (token stored in settings; digest top item pushed via
  Expo's HTTP API — no extra SDK dependency).

Both clients speak the identical REST + SSE contract in `docs/ARCHITECTURE.md`.
