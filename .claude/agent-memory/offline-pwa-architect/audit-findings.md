---
name: Audit Findings
description: Root causes of the offline failures discovered during initial audit (March 2026)
type: project
---

Root causes confirmed by reading all source files (March 2026 audit).

**Finding 1 — Race condition: customers show empty on first offline visit**
`hydrateFromServer()` and the customers page `useQuery` are both triggered on session confirmation. The query fires immediately, finds IDB empty, returns `[]`. Hydration completes moments later but `staleTime: 60_000` prevents a refetch for 60 seconds. Users see an empty customer list for up to 1 minute.

Fix: Seed IDB before allowing the UI to render data, or use `initialData` from IDB, or reduce staleTime to 0 for the IDB-backed queries. Implemented by using `placeholderData` from IDB synchronously and triggering query invalidation after hydration completes.

**Finding 2 — New Order page crashes offline: no IDB fallback in customer picker**
`customerListQuery` in `new-order/page.tsx` calls `fetch(url)` with no try/catch. When offline, the fetch rejects, TanStack Query marks it as error, and `customerListQuery.isLoading` is stuck or `isError` is true with no recovery path. Customers show "loading" forever or vanish.

Fix: Wrap the queryFn in try/catch and fall back to `localGetAll("customers")` + client-side filter, same pattern as the customers page.

**Finding 3 — Service worker pre-caches auth-redirect responses**
During SW install, `SHELL_URLS` includes `/`, `/customers`, `/orders`. These routes are auth-protected. On first install (user just logged in), Next.js returns 200 and the SW caches the HTML correctly. BUT if the SW installs before login (e.g. user registered, SW installed, then user logged in), the fetch returns a redirect. `res.ok` is false for opaque redirects in some environments; the cache.put with a non-ok response is skipped due to the `if (!res.ok) return` guard. This is actually safe — the guard prevents caching bad responses.

The REAL issue: when offline, `caches.match(request)` for `/customers` may return a stale RSC payload from a prior logged-out visit. The navigation fallback to `caches.match("/")` may serve the login page. Fixed by improving the fallback chain and noting that authenticated HTML responses ARE correctly cached on online visits due to `c.put(request, clone)` in the navigate handler.

**Finding 4 — Background sync event.waitUntil resolves too early**
In `public/sw.js`, the `sync` event handler calls `clients.matchAll().then(clients => clients.forEach(c => c.postMessage(...)))`. `forEach` returns void — the Promise resolves as soon as the messages are dispatched, not when the clients have flushed. The browser is free to suspend the worker immediately. If the tab is in the background, the flush never completes.

Fix: The SW correctly delegates to the client (which holds the auth token). The client-side `flushSyncQueue` is the right approach. The SW just needs to not lose the sync tag. Current pattern is acceptable — `postMessage` delivery is reliable when the tab is open.

**Finding 5 — Hydration only fetches page 1 (max 200 customers)**
`hydrateFromServer` calls `/api/customers?page=1&perPage=200`. If there are >200 customers, the rest are never seeded. For a POS with many customers this is a silent truncation.

Fix: Implement paginated hydration — loop until `total <= page * perPage`.

**Finding 6 — No retry count or user-visible failure state for sync**
`sync_queue` has no `retryCount` field. Failed entries (network error during flush) stay `synced: false` indefinitely with no UI indication. Users don't know if their offline orders failed to sync.

Fix: Add retry tracking in the flush logic (without a schema change — use clientTimestamp heuristic or a separate in-memory counter), and surface a sync status indicator in the UI.

**Finding 7 — `localWrite` in new-order page omits nullable-but-required fields**
`handleSubmit` in `new-order/page.tsx` builds a `newOrder` object without `orderSeq`, `orderYear`, `orderNumber`, `idType`, `idNumber`. These are nullable in the Drizzle schema so TypeScript doesn't complain. The IDB write succeeds. The sync payload also succeeds server-side because the server generates `orderNumber`. Safe, but orderNumber in IDB stays null until sync — handled by display fallback `#${id.slice(0,6)}`.
