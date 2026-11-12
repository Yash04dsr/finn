// FINN service worker — deliberately minimal: network-first passthrough with
// offline fallback for navigations. Cache versioning so old shells drop cleanly.
const CACHE = "finn-static-v2";
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "FINN";
  const options = {
    body: payload.body || "A portfolio alert needs your attention.",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: payload.url || "/" },
    tag: payload.url || "finn-alert",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === target);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
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

  // Next chunks are network-first. Development uses stable chunk URLs, so a
  // cache-first strategy can pin stale code even after a hard reload.
  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy).catch(() => undefined));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other static assets: cache first.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.endsWith(".svg") || url.pathname.endsWith(".webmanifest"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy).catch(() => undefined));
          }
          return res;
        })
    )
  );
});
