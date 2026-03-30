/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Must match the tag registered in idb.ts when queuing a background sync.
const SYNC_TAG = "goldpos-sync-v1";
const CACHE_NAME = "goldpos-shell-v5";
const APP_NAME = "A Uphills Trading Enterprise";

// Static assets that are safe to pre-cache during install.
// Do NOT include auth-protected HTML pages — they may not be accessible at
// install time and the response could be a redirect.
// Navigation responses are cached at runtime by the fetch handler.
const PRECACHE_URLS = ["/manifest.json"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheResponse(request: Request | string, response: Response): void {
  if (!response || !response.ok) return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
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

  // Never intercept API calls — offline data is served by IndexedDB in the app.
  if (url.pathname.startsWith("/api/")) return;

  // ── Immutable Next.js static assets — CacheFirst ──────────────────────────
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request)
            .then((res) => {
              cacheResponse(request, res);
              return res;
            })
            .catch(
              () =>
                new Response("Static asset unavailable offline.", {
                  status: 503,
                }),
            ),
      ),
    );
    return;
  }

  // ── Other _next paths — NetworkFirst ─────────────────────────────────────
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          cacheResponse(request, res);
          return res;
        })
        .catch(() =>
          caches
            .match(request)
            .then(
              (cached) =>
                cached ??
                new Response("Resource unavailable offline.", { status: 503 }),
            ),
        ),
    );
    return;
  }

  // ── RSC navigation payloads — NetworkFirst, stable pathname cache key ─────
  if (url.searchParams.has("_rsc")) {
    const cacheKey = new Request(url.pathname + "?_rsc", {
      headers: request.headers,
    });
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, clone));
          }
          return res;
        })
        .catch(() =>
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.match(cacheKey))
            .then(
              (cached) =>
                cached ??
                new Response("", {
                  status: 503,
                  statusText: "Offline — RSC payload unavailable",
                }),
            ),
        ),
    );
    return;
  }

  // ── Navigation requests — NetworkFirst ───────────────────────────────────
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            cacheResponse(request, res);
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
                new Response(
                  "<!doctype html><html><head><title>Offline</title></head><body>" +
                    "<p style='font-family:sans-serif;padding:2rem'>You are offline. " +
                    "Please reconnect to access " +
                    APP_NAME +
                    ".</p></body></html>",
                  {
                    status: 503,
                    headers: { "Content-Type": "text/html" },
                  },
                ),
            ),
        ),
    );
    return;
  }

  // ── manifest.json — CacheFirst ────────────────────────────────────────────
  if (url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request)
            .then((res) => {
              cacheResponse(request, res);
              return res;
            })
            .catch(
              () =>
                new Response("{}", {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                }),
            ),
      ),
    );
    return;
  }

  // ── All other requests — CacheFirst ──────────────────────────────────────
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request)
          .then((res) => {
            if (res.ok && res.type === "basic") {
              cacheResponse(request, res);
            }
            return res;
          })
          .catch(
            () =>
              new Response("Resource unavailable offline.", { status: 503 }),
          ),
    ),
  );
});

// ─── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) =>
          clients.forEach((client) =>
            client.postMessage({ type: "SW_SYNC_REQUESTED" }),
          ),
        ),
    );
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body } = event.data.json() as { title: string; body: string };
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
    }),
  );
});
