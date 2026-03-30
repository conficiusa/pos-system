---
name: Architecture Decisions
description: Key design choices made during offline-first reimplementation
type: project
---

**Decision 1 — Keep `idb` library, not migrate to Dexie**
The codebase uses `idb` v8 which is already installed. Dexie adds value for reactive queries but would require a larger refactor. The simpler fix is to correctly sequence hydration and add proper offline fallbacks in queryFns.

**Decision 2 — Hydration completions signal via custom event**
After `hydrateFromServer` completes, dispatch a `pos:hydrated` CustomEvent on `window`. React hooks can listen for this and trigger query invalidation. This avoids prop drilling and keeps the hydration logic decoupled from UI components.

**Decision 3 — Invalidate React Query cache after hydration, not before**
Invalidating before hydration would cause a second network fetch. Invalidating after means: IDB data is fresh, then React Query picks it up from its queryFn on next render. Combined with `staleTime: 0` for IDB-backed queries (or `placeholderData` pattern), this gives instant display + background refresh.

**Decision 4 — Do not cache API routes in service worker**
The service worker skips all `/api/*` routes. Auth tokens live in httpOnly cookies managed by Better Auth. Caching API responses would require re-implementing auth-aware cache invalidation. Instead, all offline data access goes through IDB directly.

**Decision 5 — Sync queue flush happens on three triggers**
1. App boot (after session confirmed, if online)
2. `window.online` event
3. Background sync event from service worker (postMessage → client flush)
This is implemented in `idb.ts` — no changes needed to the trigger logic.

**Decision 6 — `new-order` customer search must work fully offline**
The customer picker `queryFn` wraps fetch in try/catch and falls back to `localGetAll("customers")` with JS-side filtering. This is the same pattern already used in `customers/page.tsx` — it just wasn't applied to `new-order/page.tsx`.

**Decision 7 — SW install does NOT pre-cache authenticated routes**
Removed auth-protected routes from `SHELL_URLS`. The SW only pre-caches: `manifest.json`, `sw.js` itself (implicitly), and static assets discovered from the home page HTML. Navigation to `/customers` offline is served by the navigate handler's `caches.match(request)` fallback (using the last cached live response from a previous online visit), not by an install-time pre-cache of a redirect.

**Decision 8 — Add `/api/sync/pull` endpoint for incremental hydration**
The existing `/api/sync` only handles POST (push mutations). Add `GET /api/sync/pull?since={iso}` that returns customers and orders modified after the given timestamp. This enables `hydrateFromServer` to do incremental refreshes after the first full load, using `localStorage.getItem("pos-last-hydrated")` as the cursor.

**Why:** Reduces data transfer on reconnect from potentially large full-table fetches to delta-only updates.

**Decision 9 — Expose sync status via `useSyncStatus` hook**
Surface pending count and last-synced timestamp in the dashboard topbar. Give users visibility into what's pending so they trust the system.
