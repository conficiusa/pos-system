// GoldPOS Service Worker
// Strategy:
//   /_next/static/*  → CacheFirst (content-hashed, immutable)
//   /_next/*         → NetworkFirst, cache fallback
//   ?_rsc=*          → NetworkFirst, cache by pathname (RSC payloads)
//   navigate         → NetworkFirst, cache on success, fallback to cached page then "/"
//   /api/*           → Pass-through (never cache; offline data served by IndexedDB)
//   /manifest.json   → CacheFirst
//   everything else  → CacheFirst with network fallback

const SYNC_TAG = "goldpos-sync-v1";
const CACHE_NAME = "goldpos-shell-v5";

// Static assets that are safe to pre-cache during install.
// Do NOT include auth-protected HTML pages here — they may not be
// accessible at install time and the response could be a redirect.
// Navigation responses are cached at runtime by the fetch handler.
const PRECACHE_URLS = ["/manifest.json"];

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
      // Delete caches from all previous versions.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cacheResponse(request, response) {
  if (!response || !response.ok) return;
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — offline data is served by IndexedDB in the app.
  // Intercepting /api/* would break auth (cookies) and add no value.
  if (url.pathname.startsWith("/api/")) return;

  // ── Next.js immutable static assets — CacheFirst ──────────────────────────
  // /_next/static/* files are content-hashed and never change for a given hash.
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

  // ── Other _next paths (image optimisation, data routes) — NetworkFirst ────
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

  // ── RSC navigation payloads — NetworkFirst, cache by stable pathname ──────
  // Next.js App Router issues fetch requests with ?_rsc={nonce} for client-side
  // navigation. The nonce changes every deployment, making the full URL
  // uncacheable. Cache by pathname + "?_rsc" so re-navigations work offline.
  // This is safe because all dashboard pages use client-side data fetching
  // (TanStack Query + IndexedDB) — the RSC payload is just the component tree
  // with no embedded server data.
  if (url.searchParams.has("_rsc")) {
    // Use only the pathname as the cache key to survive nonce rotation.
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

  // ── Navigation requests (full page loads) — NetworkFirst ─────────────────
  // Cache the response so it is available for future offline navigations.
  // Fallback chain: cached version of the exact page → cached "/" → error.
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
                    "Please reconnect to access GoldPOS.</p></body></html>",
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

  // ── All other requests — CacheFirst with network fallback ─────────────────
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request)
          .then((res) => {
            // Only cache same-origin "basic" responses to avoid caching
            // opaque responses from third-party origins.
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
// The browser fires this event when connectivity is restored after the app
// registered a sync via `registration.sync.register(SYNC_TAG)`.
//
// The service worker cannot flush the IDB sync queue directly because it does
// not have access to the auth cookies. Instead, it posts a message to all
// open windows, which triggers flushSyncQueue() inside the page.

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          clients.forEach((client) =>
            client.postMessage({ type: "SW_SYNC_REQUESTED" }),
          );
        }),
    );
  }
});

// ─── Push notifications (for future Thursday valuation reminders) ─────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
    }),
  );
});
