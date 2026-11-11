// FINN service worker — deliberately minimal: network-first passthrough with
// offline fallback for navigations. Cache versioning so old shells drop cleanly.
const CACHE = "finn-static-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST /api/chat, /api/demo/run etc. pass through
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses (live market/alert data).
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy).catch(() => undefined));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Static assets: cache first.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith("/_next/static") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".webmanifest"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy).catch(() => undefined));
          }
          return res;
        })
    )
  );
});
