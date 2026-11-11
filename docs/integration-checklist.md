# Integration checklist — Expo app ↔ backend

Once the mobile worker finishes, verify these in order:

- [ ] `cd mobile && npx tsc --noEmit` — zero errors
- [ ] `npx expo export --platform ios` — bundle compiles
- [ ] App boots in Expo Go against `http://<lan-ip>:8000`
- [ ] Feed: digest hero + grouped alerts render from real backend data
- [ ] Detail sheet: facts table (PERSISTENT results), bio card (FEDERALBNK CFO), Why-this
- [ ] Chat: streamed answer with tool chips + citation chips; stop button works
- [ ] Settings: backend URL persists (AsyncStorage); sliders POST to /api/settings
- [ ] Settings: cost dashboard shows the live ledger from /api/costs
- [ ] Push: enable → Expo push token → POST /api/push/subscribe-expo → 200
- [ ] Run demo pipeline button → toast with mode
- [ ] Commit `mobile/` into git (after removing worker scaffolding: AGENTS.md, scripts/, src/app/explore.tsx, theme demo components)
