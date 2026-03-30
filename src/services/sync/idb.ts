import type {
  Customer,
  NewSyncQueueEntry,
  Order,
  SyncQueueEntry,
} from "@/lib/db/schemas";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { nanoid } from "nanoid";

// ─── Constants ─────────────────────────────────────────────────────────────────

// Must match the SYNC_TAG constant in public/sw.js
export const SYNC_TAG = "goldpos-sync-v1";

// LocalStorage key for tracking the last full hydration timestamp.
// Used to enable incremental pull syncs after the first full seed.
const LAST_HYDRATED_KEY = "pos-last-hydrated";

// CustomEvent name dispatched on window after hydration completes.
// React hooks can listen for this to invalidate their queries.
export const HYDRATION_COMPLETE_EVENT = "pos:hydrated";

// Maximum number of sync attempts before giving up on an entry.
const MAX_RETRY_ATTEMPTS = 3;

// ─── Sync batch types ─────────────────────────────────────────────────────────

export interface SyncBatchResponse {
  synced: string[];
  conflicts: Array<{
    id: string;
    resolution: "server-wins" | "client-wins" | "merged";
    serverValue?: Record<string, unknown>;
  }>;
  errors: Array<{ id: string; error: string }>;
}

// Augments SyncQueueEntry with an in-memory retry counter.
// We do not want a DB migration just for retry tracking, so we track
// attempts in a module-level Map keyed by entry id.
const _retryMap = new Map<string, number>();

// ─── IndexedDB schema ─────────────────────────────────────────────────────────
// Mirrors the D1 schema using Drizzle's inferred types directly.

interface GoldPOSDB extends DBSchema {
  customers: {
    key: string;
    value: Customer;
    indexes: { by_phone: string };
  };
  orders: {
    key: string;
    value: Order;
    indexes: {
      by_customer: string;
      by_status: string;
    };
  };
  sync_queue: {
    key: string;
    value: SyncQueueEntry;
    indexes: { by_synced: number };
  };
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let _db: IDBPDatabase<GoldPOSDB> | null = null;

export async function getIDB(): Promise<IDBPDatabase<GoldPOSDB>> {
  if (_db) return _db;
  _db = await openDB<GoldPOSDB>("goldpos-v1", 1, {
    upgrade(db) {
      const custStore = db.createObjectStore("customers", { keyPath: "id" });
      custStore.createIndex("by_phone", "phone", { unique: true });

      const orderStore = db.createObjectStore("orders", { keyPath: "id" });
      orderStore.createIndex("by_customer", "customerId");
      orderStore.createIndex("by_status", "status");

      const syncStore = db.createObjectStore("sync_queue", { keyPath: "id" });
      // IDB index on `synced` — stored as 0/1 integer matching Drizzle's boolean mode
      syncStore.createIndex("by_synced", "synced");
    },
    blocked() {
      // Another tab has an older version open — let it resolve naturally.
      console.warn("[IDB] Database upgrade blocked by another tab.");
    },
    blocking() {
      // This version is blocking a newer upgrade in another tab.
      _db?.close();
      _db = null;
    },
    terminated() {
      // The browser killed the connection — reset so the next call re-opens.
      _db = null;
    },
  });
  return _db;
}

// ─── Generic local write ──────────────────────────────────────────────────────
// Writes to IDB immediately, enqueues a sync mutation, then flushes if online.

export async function localWrite<T extends { id: string; updatedAt?: string }>(
  table: "customers" | "orders",
  operation: "insert" | "update",
  data: T,
): Promise<T> {
  const db = await getIDB();
  const now = new Date().toISOString();

  // 1. Write to local IDB store — instant, always succeeds offline.
  await db.put(table, data as unknown as Customer & Order);

  // 2. Build sync queue entry using Drizzle's NewSyncQueueEntry type.
  const entry: NewSyncQueueEntry = {
    id: nanoid(),
    tableName: table,
    recordId: data.id,
    operation,
    payload: JSON.stringify(data),
    clientTimestamp: data.updatedAt ?? now,
    synced: false,
    syncedAt: null,
    conflictResolution: null,
    createdAt: now,
  };

  await db.put("sync_queue", entry as SyncQueueEntry);

  // 3. Flush to server immediately if online — fire and forget.
  if (typeof navigator !== "undefined" && navigator.onLine) {
    flushSyncQueue().catch(console.warn);
  }

  return data;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function localGetAll(table: "customers"): Promise<Customer[]>;
export async function localGetAll(table: "orders"): Promise<Order[]>;
export async function localGetAll(
  table: "customers" | "orders",
): Promise<Customer[] | Order[]> {
  const db = await getIDB();
  return db.getAll(table) as Promise<Customer[] | Order[]>;
}

export async function localGetById(
  table: "customers",
  id: string,
): Promise<Customer | undefined>;
export async function localGetById(
  table: "orders",
  id: string,
): Promise<Order | undefined>;
export async function localGetById(
  table: "customers" | "orders",
  id: string,
): Promise<Customer | Order | undefined> {
  const db = await getIDB();
  return db.get(table, id);
}

export async function localSearchCustomers(query: string): Promise<Customer[]> {
  const db = await getIDB();
  const all = await db.getAll("customers");
  const q = query.toLowerCase();
  return all.filter(
    (c) =>
      c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q),
  );
}

export async function localGetOrdersByCustomer(
  customerId: string,
): Promise<Order[]> {
  const db = await getIDB();
  return db.getAllFromIndex("orders", "by_customer", customerId);
}

// ─── Sync queue: count pending ────────────────────────────────────────────────

export async function getPendingSyncCount(): Promise<number> {
  try {
    const db = await getIDB();
    const all = await db.getAll("sync_queue");
    return all.filter((e) => !e.synced).length;
  } catch {
    return 0;
  }
}

// ─── Sync queue flush ─────────────────────────────────────────────────────────
// Reads all pending IDB sync queue entries and POSTs them to /api/sync.
// Marks each entry synced or increments its retry counter.
// Returns null if there is nothing to sync or if we are offline.

let _flushing = false;

export async function flushSyncQueue(): Promise<SyncBatchResponse | null> {
  if (_flushing) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  _flushing = true;

  try {
    const db = await getIDB();
    const allEntries = await db.getAll("sync_queue");
    const pending = allEntries.filter((e) => {
      if (e.synced) return false;
      // Skip entries that have exceeded max retries — they need manual review.
      const attempts = _retryMap.get(e.id) ?? 0;
      return attempts < MAX_RETRY_ATTEMPTS;
    });

    if (!pending.length) return null;

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutations: pending }),
    });

    if (!res.ok) {
      // Increment retry counter for all pending entries on server error.
      for (const entry of pending) {
        _retryMap.set(entry.id, (_retryMap.get(entry.id) ?? 0) + 1);
      }
      throw new Error(`Sync failed: ${res.status}`);
    }

    const result: SyncBatchResponse = await res.json();

    // Mark successfully synced entries.
    const tx = db.transaction("sync_queue", "readwrite");

    for (const id of result.synced) {
      const entry = await tx.store.get(id);
      if (entry) {
        await tx.store.put({
          ...entry,
          synced: true,
          syncedAt: new Date().toISOString(),
        } satisfies SyncQueueEntry);
        _retryMap.delete(id);
      }
    }

    // Handle conflicts — server value wins for financial tables,
    // merged value applied for customer metadata.
    for (const conflict of result.conflicts) {
      const entry = await tx.store.get(conflict.id);
      if (entry) {
        await tx.store.put({
          ...entry,
          synced: true,
          syncedAt: new Date().toISOString(),
          conflictResolution: conflict.resolution,
        } satisfies SyncQueueEntry);
        _retryMap.delete(conflict.id);

        // Overwrite local record with the server-resolved value.
        if (conflict.serverValue) {
          const localTable = entry.tableName as "customers" | "orders";
          if (localTable === "customers") {
            await db.put("customers", conflict.serverValue as Customer);
          } else if (localTable === "orders") {
            await db.put("orders", conflict.serverValue as Order);
          }
        }
      }
    }

    // Increment retry counter for server-reported errors.
    for (const err of result.errors) {
      _retryMap.set(err.id, (_retryMap.get(err.id) ?? 0) + 1);
    }

    await tx.done;
    return result;
  } catch (err) {
    console.warn("[Sync] Flush failed:", err);
    return null;
  } finally {
    _flushing = false;
  }
}

// Returns the set of entry IDs that have permanently failed (exceeded retries).
export function getFailedSyncIds(): string[] {
  const failed: string[] = [];
  for (const [id, count] of _retryMap.entries()) {
    if (count >= MAX_RETRY_ATTEMPTS) failed.push(id);
  }
  return failed;
}

// ─── Hydrate local cache from server ─────────────────────────────────────────
// Called on app init — pulls latest data from D1 into IDB so the app works
// offline after the first online visit.
//
// Strategy:
//   - First visit: full fetch (all pages)
//   - Subsequent visits: incremental fetch via /api/sync/pull?since={iso}
//     falling back to full fetch if the pull endpoint fails
//
// Dispatches HYDRATION_COMPLETE_EVENT when done so React hooks can invalidate.

export async function hydrateFromServer(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;

  try {
    const since = localStorage.getItem(LAST_HYDRATED_KEY);

    if (since) {
      // Incremental pull: only fetch records modified since last hydration.
      await incrementalPull(since);
    } else {
      // Full seed: paginate through all customers and orders.
      await fullSeed();
    }

    localStorage.setItem(LAST_HYDRATED_KEY, new Date().toISOString());

    // Signal to UI that fresh data is now in IDB.
    window.dispatchEvent(new CustomEvent(HYDRATION_COMPLETE_EVENT));
  } catch (err) {
    // Hydration failure is non-fatal — IDB retains last good state.
    console.warn("[Hydrate] Hydration failed:", err);
  }
}

async function fullSeed(): Promise<void> {
  const db = await getIDB();

  // Paginate customers — fetch all pages until exhausted.
  let page = 1;
  const perPage = 200;
  while (true) {
    const res = await fetch(
      `/api/customers?page=${page}&perPage=${perPage}`,
    );
    if (!res.ok) break;
    const json = (await res.json()) as {
      data: Customer[];
      total: number;
    };
    if (!json.data?.length) break;

    const tx = db.transaction("customers", "readwrite");
    await Promise.all(json.data.map((c) => tx.store.put(c)));
    await tx.done;

    if (page * perPage >= json.total) break;
    page++;
  }

  // Paginate orders — same pattern.
  page = 1;
  while (true) {
    const res = await fetch(`/api/orders?page=${page}&perPage=${perPage}`);
    if (!res.ok) break;
    const json = (await res.json()) as {
      data: Order[];
      total: number;
    };
    if (!json.data?.length) break;

    const tx = db.transaction("orders", "readwrite");
    await Promise.all(json.data.map((o) => tx.store.put(o)));
    await tx.done;

    if (page * perPage >= json.total) break;
    page++;
  }
}

async function incrementalPull(since: string): Promise<void> {
  const db = await getIDB();

  const res = await fetch(
    `/api/sync/pull?since=${encodeURIComponent(since)}`,
  );
  if (!res.ok) {
    // If the pull endpoint fails, fall back to a full seed.
    await fullSeed();
    return;
  }

  const json = (await res.json()) as {
    customers: Customer[];
    orders: Order[];
  };

  if (json.customers?.length) {
    const tx = db.transaction("customers", "readwrite");
    await Promise.all(json.customers.map((c) => tx.store.put(c)));
    await tx.done;
  }

  if (json.orders?.length) {
    const tx = db.transaction("orders", "readwrite");
    await Promise.all(json.orders.map((o) => tx.store.put(o)));
    await tx.done;
  }
}

// ─── Background sync registration ────────────────────────────────────────────

async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (reg as any).sync?.register(SYNC_TAG);
  } catch {
    // Background Sync API not supported — online-event flush is sufficient.
  }
}

// ─── Global event listeners (browser only) ───────────────────────────────────

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushSyncQueue().catch(console.warn);
    registerBackgroundSync().catch(console.warn);
    // Also run an incremental pull to get any server-side changes made while offline.
    hydrateFromServer().catch(console.warn);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener(
      "message",
      (event: MessageEvent) => {
        if (
          (event.data as { type?: string })?.type === "SW_SYNC_REQUESTED"
        ) {
          flushSyncQueue().catch(console.warn);
        }
      },
    );
  }
}
