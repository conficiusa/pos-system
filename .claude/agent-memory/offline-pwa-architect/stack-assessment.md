---
name: Stack Assessment
description: Honest evaluation of Next.js App Router + Cloudflare Workers for offline-first POS
type: project
---

## Is this the right stack?

**Short answer:** The backend (Cloudflare Workers + D1) is well-suited. The frontend (Next.js App Router) creates real friction for offline-first, but is workable with the right client-side architecture. A pure SPA would be simpler but migration cost is high.

## What works

- **Cloudflare Workers + D1 as sync API target**: Low latency edge API, SQLite semantics match the client-side IndexedDB model closely. Conflict resolution is straightforward. This is genuinely good.
- **All dashboard pages are already `"use client"`**: This project has already made the right call — there are no RSC data fetches to replace. Data comes from `useQuery` + fetch. This means offline-first is entirely achievable without touching the rendering model.
- **IndexedDB via `idb`**: The schema mirrors the D1 schema. This is the correct local-first pattern.

## What creates friction

- **RSC navigation requests (`?_rsc`)**: When the user navigates between routes offline, Next.js issues a fetch for the RSC payload. The SW must intercept these and serve a cached response. The current approach (cache by pathname + `?_rsc` suffix) is correct in theory but the cached RSC payload may contain stale server-side data if any RSC props were used. Since all data fetching is client-side (`useQuery`), this is safe — the RSC payload is essentially just the component tree structure with no embedded data.
- **SW install pre-caching authenticated routes**: Auth-protected Next.js routes return HTML that embeds session state. Pre-caching these at install time (before login) is wrong. The fix is to only cache responses from online navigations (which is already done by the navigate handler's `c.put(request, clone)` on success).
- **`staleTime: 60_000` in QueryClient**: React Query won't refetch stale data for 60 seconds. This means IDB data updated by hydration won't appear until the next query fires. Fix: set `staleTime: 0` for all offline-capable queries, or invalidate queries after hydration.

## Compared to alternatives

- **Vite + React SPA + Hono API**: Would be simpler for offline-first (no RSC/SW interaction complexity, simpler service worker). But would require rewriting the entire frontend. Not recommended given existing investment.
- **Remix**: Similar RSC friction issues. No significant advantage here.
- **Native mobile app**: Would be the "right" answer for a true field POS. But the investment in a web PWA that works is justified for this use case (staff use tablets/phones with Chrome).

## Recommendation

Keep the stack. Fix the client-side data layer as described in audit-findings.md. The backend needs no changes beyond adding the `/api/sync/pull` endpoint.
