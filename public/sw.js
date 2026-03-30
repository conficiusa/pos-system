// A Uphills Trading Enterprise Service Worker
// Strategy:
//   /_next/static/*  → CacheFirst (content-hashed, immutable)
//   /_next/*         → NetworkFirst, cache fallback
//   ?_rsc=*          → NetworkFirst, cache by pathname (RSC payloads)
//   navigate         → NetworkFirst, cache on success, fallback to cached page then "/"
//   /api/*           → Pass-through (never cache; offline data served by IndexedDB)
//   /manifest.json   → CacheFirst
//   everything else  → CacheFirst with network fallback

const SYNC_TAG = "goldpos-sync-v1";
const CACHE_NAME = "goldpos-shell-v7";
const APP_NAME = "A Uphills Trading Enterprise";
const APP_TAGLINE = "Gold Trading Specialists";

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

function getNavigationCacheKey(url) {
  return url.pathname === "/" ? "/" : url.pathname.replace(/\/$/, "");
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
                }),
            ),
        ),
    );
    return;
  }

  // ── Navigation requests (full page loads) — NetworkFirst ─────────────────
  // Cache by pathname so query-string variations like /new-order?customerId=1
  // can still reuse the same offline document.
  if (request.mode === "navigate") {
    const cacheKey = getNavigationCacheKey(url);
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
              (fallback) =>
                fallback ??
                new Response(
                  "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" +
                    APP_NAME +
                    "</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f2f3ef;color:#1f1b16;font-family:Inter,system-ui,sans-serif}.card{max-width:420px;border:1px solid #ebe6dc;border-radius:20px;background:#fff;padding:28px;box-shadow:0 18px 48px rgba(31,27,22,0.08)}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#085041}.title{margin:10px 0 8px;font-size:26px;line-height:1.1}.copy{margin:0;color:#6f6b64;font-size:14px;line-height:1.6}.tag{margin-top:14px;display:inline-flex;border-radius:999px;background:#e1f5ee;padding:6px 10px;font-size:11px;font-weight:600;color:#085041}</style></head><body><div class='card'><div class='eyebrow'>" +
                    APP_NAME +
                    "</div><h1 class='title'>You are offline</h1><p class='copy'>This page needs an internet connection to load. Reconnect to continue using " +
                    APP_NAME +
                    ".</p><div class='tag'>" +
                    APP_TAGLINE +
                    "</div></div></body></html>",
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
