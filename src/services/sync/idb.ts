import { Customer, NewSyncQueueEntry, Order, SyncQueueEntry } from "@/lib/db/schemas";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { nanoid } from "nanoid";

// Import ONLY from the Drizzle schema — no manual interfaces

// Must match the SYNC_TAG constant in public/sw.ts
export const SYNC_TAG = "goldpos-sync-v1";

// ─── Sync batch types (not DB-backed, so defined here) ───────────────────────

export interface SyncBatchResponse {
  synced: string[];
  conflicts: Array<{
    id: string;
    resolution: "server-wins" | "client-wins" | "merged";
    serverValue?: Record<string, unknown>;
  }>;
  errors: Array<{ id: string; error: string }>;
}

// ─── IndexedDB schema ─────────────────────────────────────────────────────────
// Mirrors the D1 schema using Drizzle's inferred types directly.
// The IDB store is a local cache — column names match the Drizzle schema
// (camelCase, matching the `.$inferSelect` output).

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
      // IDB index on `synced` (stored as 0/1 integer to match Drizzle's boolean mode)
      syncStore.createIndex("by_synced", "synced");
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

  // 1. Write to local IDB store — instant, always succeeds
  // Cast needed: T is constrained to {id, updatedAt} but callers always pass Customer | Order
  await db.put(table, data as unknown as Customer & Order);

  // 2. Build sync queue entry using Drizzle's NewSyncQueueEntry type
  const entry: NewSyncQueueEntry = {
    id: nanoid(),
    tableName: table,
    recordId: data.id,
    operation,
    // Payload is JSON-stringified — matches the `text` column in schema.ts
    payload: JSON.stringify(data),
    clientTimestamp: data.updatedAt ?? now,
    synced: false,
    syncedAt: null,
    conflictResolution: null,
    createdAt: now,
  };

  // Store as SyncQueueEntry (with synced as boolean per Drizzle's mode)
  await db.put("sync_queue", entry as SyncQueueEntry);

  // 3. Flush to server immediately if online
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

// ─── Sync queue flush ─────────────────────────────────────────────────────────

let _flushing = false;

export async function flushSyncQueue(): Promise<SyncBatchResponse | null> {
  if (_flushing || !navigator.onLine) return null;
  _flushing = true;

  try {
    const db = await getIDB();

    // Get all unsynced entries. IDB stores `synced` as a boolean (false),
    // so we filter in JS rather than relying on the index with a numeric key.
    const allEntries = await db.getAll("sync_queue");
    const pending = allEntries.filter((e) => !e.synced);
    if (!pending.length) return null;

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutations: pending }),
    });

    if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

    const result: SyncBatchResponse = await res.json();

    // Mark synced entries in IDB
    const tx = db.transaction("sync_queue", "readwrite");

    for (const id of result.synced) {
      const entry = await tx.store.get(id);
      if (entry) {
        await tx.store.put({
          ...entry,
          synced: true,
          syncedAt: new Date().toISOString(),
        } satisfies SyncQueueEntry);
      }
    }

    // Handle conflicts — server value wins for financial tables,
    // merged value applied for metadata tables
    for (const conflict of result.conflicts) {
      const entry = await tx.store.get(conflict.id);
      if (entry) {
        await tx.store.put({
          ...entry,
          synced: true,
          syncedAt: new Date().toISOString(),
          conflictResolution: conflict.resolution,
        } satisfies SyncQueueEntry);

        // Overwrite local record with whatever the server resolved to
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

    await tx.done;
    return result;
  } finally {
    _flushing = false;
  }
}

// ─── Hydrate local cache from server ─────────────────────────────────────────
// Called on app init — pulls latest data from D1 into IDB so the app works
// immediately when it goes offline after first load.

export async function hydrateFromServer(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const [custsRes, ordersRes] = await Promise.all([
      fetch("/api/customers?page=1&perPage=200"),
      fetch("/api/orders?page=1&perPage=200"),
    ]);

    const db = await getIDB();

    if (custsRes.ok) {
      const { data }: { data: Customer[] } = await custsRes.json();
      const tx = db.transaction("customers", "readwrite");
      await Promise.all(data.map((c) => tx.store.put(c)));
      await tx.done;
    }

    if (ordersRes.ok) {
      const { data }: { data: Order[] } = await ordersRes.json();
      const tx = db.transaction("orders", "readwrite");
      await Promise.all(data.map((o) => tx.store.put(o)));
      await tx.done;
    }
  } catch {
    // Hydration failure is non-fatal — IDB retains last good state
  }
}

// Register background sync when online
async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (reg as any).sync?.register(SYNC_TAG);
  } catch {
    // Background Sync API not supported — immediate flush is sufficient
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushSyncQueue().catch(console.warn);
    registerBackgroundSync().catch(console.warn);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === "SW_SYNC_REQUESTED") {
        flushSyncQueue().catch(console.warn);
      }
    });
  }
}
