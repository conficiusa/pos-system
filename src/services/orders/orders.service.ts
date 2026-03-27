import { and, desc, eq, like, or, sql } from "drizzle-orm"
import { DB } from "@/lib/db"
import { customers, orders } from "@/lib/db/schemas"
import { orderQueries } from "./orders.dal"
import { paginate } from "@/services/utils/dal.utils"

// ─── Orders service ───────────────────────────────────────────────────────────

export const ordersService = {
  async list(
    db: DB,
    opts: {
      status?: "pending" | "reconciled"
      q?: string
      page?: number
      perPage?: number
    } = {},
  ) {
    const { status, q, page = 1, perPage = 50 } = opts
    const { limit, offset } = paginate(page, perPage)

    const conditions = []
    if (status) conditions.push(eq(orders.status, status))
    if (q && q.trim()) {
      const pattern = `%${q.trim()}%`
      conditions.push(
        or(like(customers.name, pattern), like(orders.id, pattern), like(orders.orderNumber, pattern)),
      )
    }
    const where = conditions.length
      ? conditions.length === 1
        ? conditions[0]
        : and(...conditions)
      : undefined

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: orders.id,
          customerId: orders.customerId,
          createdBy: orders.createdBy,
          weightGrams: orders.weightGrams,
          estimatedRate: orders.estimatedRate,
          estimatedValue: orders.estimatedValue,
          ledgerAdjustment: orders.ledgerAdjustment,
          amountPaid: orders.amountPaid,
          notes: orders.notes,
          status: orders.status,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          orderNumber: orders.orderNumber,
          customerName: customers.name,
          customerPhone: customers.phone,
        })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .where(where),
    ])

    return { data, total, page, perPage }
  },

  getById(db: DB, id: string) {
    return orderQueries.getById(db, id)
  },

  getByCustomer(db: DB, customerId: string) {
    return orderQueries.getByCustomer(db, customerId)
  },

  getPendingForReconciliation(db: DB) {
    return orderQueries.getPendingForReconciliation(db)
  },

  weeklyStats(db: DB) {
    return orderQueries.weeklyStats(db)
  },
}
