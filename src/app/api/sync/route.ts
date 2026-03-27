import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { customers, orders, ledgerEntries } from "@/lib/db/schemas"
import { syncQueueQueries } from "@/services/sync/sync.dal"
import { auth } from "@/lib/auth"
import { eq } from "drizzle-orm"
import type { SyncQueueEntry } from "@/lib/db/schemas"
import type { SyncBatchResponse } from "@/services/sync/idb"
import { orderQueries, formatOrderNumber } from "@/services/orders/orders.dal"
import { nanoid } from "nanoid"

// Conflict rules mirror durable-object.ts:
// Financial tables → server always wins
// Customers       → last-write-wins merge on safe metadata fields

const FINANCIAL_TABLES = new Set(["orders", "valuations", "ledger_entries"])
const MERGEABLE_CUSTOMER_FIELDS = ["name", "phone", "idType", "idNumber", "notes"] as const

export async function POST(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const { mutations } = (await request.json()) as { mutations: SyncQueueEntry[] }

  const synced: string[] = []
  const conflicts: SyncBatchResponse["conflicts"] = []
  const errors: SyncBatchResponse["errors"] = []

  for (const mutation of mutations) {
    try {
      const payload = JSON.parse(mutation.payload) as Record<string, unknown>
      const tableName = mutation.tableName

      if (tableName === "customers") {
        if (mutation.operation === "insert") {
          await db
            .insert(customers)
            .values(payload as typeof customers.$inferInsert)
            .onConflictDoNothing()
        } else {
          // update — check for conflict via updatedAt timestamp
          const rows = await db
            .select()
            .from(customers)
            .where(eq(customers.id, mutation.recordId))
            .limit(1)
          const existing = rows[0]

          if (existing) {
            const serverUpdatedAt = existing.updatedAt
            const hasConflict =
              serverUpdatedAt != null &&
              new Date(serverUpdatedAt) > new Date(mutation.clientTimestamp)

            if (!hasConflict) {
              const { id: _id, ...data } = payload
              void _id
              await db
                .update(customers)
                .set({ ...(data as Partial<typeof customers.$inferInsert>), updatedAt: new Date().toISOString() })
                .where(eq(customers.id, mutation.recordId))
            } else {
              // Merge safe metadata fields — server wins on everything else
              const merged: Partial<typeof customers.$inferInsert> = {}
              for (const field of MERGEABLE_CUSTOMER_FIELDS) {
                const val = payload[field]
                if (val != null && val !== "") {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ;(merged as any)[field] = val
                }
              }
              merged.updatedAt = new Date().toISOString()
              await db
                .update(customers)
                .set(merged)
                .where(eq(customers.id, mutation.recordId))

              conflicts.push({
                id: mutation.id,
                resolution: "merged",
                serverValue: { ...existing, ...merged },
              })
              await syncQueueQueries.markSynced(db, mutation.id, "merged")
              continue
            }
          }
        }
      } else if (tableName === "orders" && mutation.operation === "insert") {
        // Financial table: only allow inserts (server wins on any update conflict).
        // Assign the human-readable order number here so it is always generated
        // server-side, keeping the sequence consistent even with offline clients.
        const year = new Date().getFullYear()
        const seq = await orderQueries.getNextOrderSeq(db, year)
        const orderPayload = payload as typeof orders.$inferInsert
        const orderNumber = formatOrderNumber(seq, year)
        const inserted = await db
          .insert(orders)
          .values({ ...orderPayload, orderYear: year, orderSeq: seq, orderNumber })
          .onConflictDoNothing()
          .returning({ id: orders.id })

        // Write payout ledger entry only on first successful insert (not on retry)
        if (inserted[0] && orderPayload.amountPaid != null && Number(orderPayload.amountPaid) > 0) {
          await db.insert(ledgerEntries).values({
            id: nanoid(),
            customerId: String(orderPayload.customerId),
            orderId: inserted[0].id,
            valuationId: null,
            amount: Number(orderPayload.amountPaid),
            type: "payout",
            description: `Order payout — ${orderNumber}`,
            createdBy: String(orderPayload.createdBy),
            createdAt: new Date().toISOString(),
          })
        }
      } else if (FINANCIAL_TABLES.has(tableName)) {
        // Server-authoritative: skip client updates to financial records
        conflicts.push({ id: mutation.id, resolution: "server-wins" })
        await syncQueueQueries.markSynced(db, mutation.id, "server-wins")
        continue
      }

      await syncQueueQueries.markSynced(db, mutation.id)
      synced.push(mutation.id)
    } catch (err) {
      errors.push({
        id: mutation.id,
        error: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  return NextResponse.json({ synced, conflicts, errors } satisfies SyncBatchResponse)
}
