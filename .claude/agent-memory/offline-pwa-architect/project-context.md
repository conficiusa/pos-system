---
name: Project Context
description: Stack details, domain model, and critical constraints for the GoldPOS offline-first PWA
type: project
---

Gold/Jewelry POS system. Staff buy gold from customers in the field, with or without internet.

**Stack:**
- Next.js 16 (App Router), all dashboard pages are `"use client"` components
- Cloudflare Workers via OpenNextJS, D1 (SQLite), Drizzle ORM
- Better Auth for session management (rolls expiresAt forward; session cached to localStorage as offline fallback)
- IndexedDB via `idb` library (not Dexie), at `src/services/sync/idb.ts`
- Service worker at `public/sw.js` (plain JS copy of `src/services/sync/sw.ts`)
- TanStack Query v5 for data fetching with `staleTime: 60_000`, `retry: 1`
- Package manager: pnpm

**Domain model (D1/IndexedDB):**
- `customers` — id, name, phone, idType, idNumber, notes, ledgerBalance, createdBy, createdAt, updatedAt
- `orders` — id, customerId, createdBy, weightGrams, estimatedRate, estimatedValue, ledgerAdjustment, amountPaid, notes, orderSeq, orderYear, orderNumber, status (pending|reconciled), createdAt, updatedAt
- `sync_queue` — id, tableName, recordId, operation (insert|update), payload (JSON), clientTimestamp, synced (boolean), syncedAt, conflictResolution, createdAt

**Why:** Conflict resolution: customers → last-write-wins merge on metadata fields; orders → server wins (financial integrity). `orderNumber` (ORD-0001-26) is generated server-side to keep sequence consistent across offline clients.

**How to apply:** When touching sync logic, remember orderNumber is null until first sync — show `#${id.slice(0,6).toUpperCase()}` as fallback display.
