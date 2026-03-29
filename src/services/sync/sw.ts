/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Must match the tag registered in idb.ts when queuing a background sync
const SYNC_TAG = "goldpos-sync-v1";
const CACHE_NAME = "goldpos-shell-v2";

// App shell — pages that should be available offline
const SHELL_URLS = [
  "/",
  "/customers",
  "/orders",
  "/ledger",
  "/reports",
  "/login",
  "/manifest.json",
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // Ignore individual failures so one bad URL doesn't block the install
      .then((cache) =>
        Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      // Remove any caches from previous versions
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== CACHE_NAME)
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — let idb.ts handle offline writes
  if (url.pathname.startsWith("/api/")) return;

  // Next.js internal routes — pass through
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request).catch(() => new Response("", { status: 503 })),
    );
    return;
  }

  // Navigation requests — network first, fall back to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache successful navigation responses
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
                new Response("Offline — please reconnect", { status: 503 }),
            ),
        ),
    );
    return;
  }

  // Static assets — cache first, network fallback
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
        }),
    ),
  );
});

// ─── Background sync ──────────────────────────────────────────────────────────
// Fired by the browser when connectivity is restored after the app registered
// a sync via `registration.sync.register(SYNC_TAG)`.
// We call the server-side flush endpoint which reads unsynced rows from D1
// sync_queue and routes them through the Durable Object.

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      fetch("/api/sync/flush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No body needed — flush endpoint reads from D1 sync_queue directly
      }).catch(() => {
        // Silent failure — browser will retry on next connectivity event
      }),
    );
  }
});

// ─── Push notifications (optional — for future Thursday run reminders) ────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body } = event.data.json() as { title: string; body: string };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    }),
  );
});
