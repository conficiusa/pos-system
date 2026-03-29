const SYNC_TAG = "goldpos-sync-v1";
const CACHE_NAME = "goldpos-shell-v2";

// App shell — pre-cached on SW install so the app works offline immediately
const SHELL_URLS = [
  "/",
  "/customers",
  "/orders",
  "/ledger",
  "/reports",
  "/login",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Ignore individual failures so one bad URL doesn't block the install
      .then((cache) =>
        Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {})))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== CACHE_NAME)
              .map((key) => caches.delete(key))
          )
        ),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls
  if (url.pathname.startsWith("/api/")) return;

  // Next.js internals — network only
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request).catch(() => new Response("", { status: 503 }))
    );
    return;
  }

  // Navigation — network first, fall back to cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("/"))
            .then(
              (fallback) =>
                fallback ??
                new Response("Offline — please reconnect", { status: 503 })
            )
        )
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          if (res.ok && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
    )
  );
});

// Background sync — tell active clients to flush their IDB queue
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) =>
          clients.forEach((client) =>
            client.postMessage({ type: "SW_SYNC_REQUESTED" })
          )
        )
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});
