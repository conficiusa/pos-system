/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Must match the tag registered in idb.ts when queuing a background sync
const SYNC_TAG = "goldpos-sync-v1";
const CACHE_NAME = "goldpos-shell-v4";

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
      .then(async (cache) => {
        const assetUrls = new Set<string>();

        // Fetch shell pages, cache them, and extract /_next/static/ asset URLs
        // from HTML responses so the JS/CSS chunks are also available offline.
        await Promise.all(
          SHELL_URLS.map(async (url) => {
            try {
              const res = await fetch(url);
              if (!res.ok) return;
              const clone = res.clone();
              await cache.put(new Request(url), clone);

              // Only parse HTML responses for asset references
              const ct = res.headers.get("content-type") || "";
              if (ct.includes("text/html")) {
                const html = await res.text();
                const matches = html.matchAll(/\/_next\/static\/[^"'\s)>]+/g);
                for (const m of matches) assetUrls.add(m[0]);
              }
            } catch {
              // Individual failures are non-fatal
            }
          }),
        );

        // Pre-cache the extracted static assets (JS chunks, CSS, etc.)
        if (assetUrls.size > 0) {
          await Promise.all(
            [...assetUrls].map((url) => cache.add(url).catch(() => {})),
          );
        }
      })
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

  // Next.js static assets (immutable, content-hashed) — cache first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request)
            .then((res) => {
              if (res.ok) {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(request, clone));
              }
              return res;
            })
            .catch(() => new Response("", { status: 503 })),
      ),
    );
    return;
  }

  // Other _next paths — network first, cache fallback
  if (url.pathname.startsWith("/_next/")) {
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
            .then((cached) => cached ?? new Response("", { status: 503 })),
        ),
    );
    return;
  }

  // RSC requests (client-side navigations via React Server Components)
  // Cache by pathname only — the _rsc nonce changes per deployment and would
  // never match on a cache lookup. Serving a cached RSC payload is safe because
  // these pages are client components that load data via useQuery independently.
  if (url.searchParams.has("_rsc")) {
    const rscCacheKey = url.pathname + "?_rsc";
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(rscCacheKey, clone));
          }
          return res;
        })
        .catch(() =>
          caches
            .open(CACHE_NAME)
            .then((c) => c.match(rscCacheKey))
            .then(
              (cached) => cached ?? new Response("", { status: 503 }),
            ),
        ),
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
        fetch(request)
          .then((res) => {
            if (res.ok && res.type === "basic") {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
          .catch(() => new Response("", { status: 503 })),
    ),
  );
});

// ─── Background sync ──────────────────────────────────────────────────────────
// Fired by the browser when connectivity is restored after the app registered
// a sync via `registration.sync.register(SYNC_TAG)`.
// Tell active clients to flush their IDB queue (they have the auth token).

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
