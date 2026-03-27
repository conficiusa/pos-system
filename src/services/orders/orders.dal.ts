import { DB } from "@/lib/db";
import { eq, sql, asc, desc, max } from "drizzle-orm";
import { customers } from "@/lib/db/schemas/customers.schema";
import { orders } from "@/lib/db/schemas/orders.schema";
import { paginate, PaginatedResult } from "@/services/utils/dal.utils";
import type { Order, NewOrder } from "@/lib/db/schemas/orders.schema";

export function formatOrderNumber(seq: number, year: number): string {
  return `ORD-${String(seq).padStart(4, "0")}-${String(year).slice(-2)}`
}

export const orderQueries = {
  async getNextOrderSeq(db: DB, year: number): Promise<number> {
    const rows = await db
      .select({ maxSeq: max(orders.orderSeq) })
      .from(orders)
      .where(eq(orders.orderYear, year))
    return (rows[0]?.maxSeq ?? 0) + 1
  },

  async list(
    db: DB,
    opts: {
      status?: "pending" | "reconciled";
      page?: number;
      perPage?: number;
    } = {},
  ) {
    const { status, page = 1, perPage = 50 } = opts;
    const { limit, offset } = paginate(page, perPage);
    const where = status ? eq(orders.status, status) : undefined;

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
        .where(where),
    ]);

    return { data, total, page, perPage } satisfies PaginatedResult<
      (typeof data)[0]
    >;
  },

  async getById(db: DB, id: string) {
    const rows = await db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        weightGrams: orders.weightGrams,
        estimatedRate: orders.estimatedRate,
        estimatedValue: orders.estimatedValue,
        ledgerAdjustment: orders.ledgerAdjustment,
        amountPaid: orders.amountPaid,
        notes: orders.notes,
        status: orders.status,
        createdAt: orders.createdAt,
        orderNumber: orders.orderNumber,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerLedgerBalance: customers.ledgerBalance,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.id, id))
      .limit(1);
    return rows[0];
  },

  async getByCustomer(db: DB, customerId: string): Promise<Order[]> {
    return db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt))
      .limit(20);
  },

  async getPendingForReconciliation(db: DB) {
    return db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        weightGrams: orders.weightGrams,
        estimatedRate: orders.estimatedRate,
        estimatedValue: orders.estimatedValue,
        amountPaid: orders.amountPaid,
        notes: orders.notes,
        createdAt: orders.createdAt,
        orderNumber: orders.orderNumber,
        customerName: customers.name,
        customerPhone: customers.phone,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.status, "pending"))
      .orderBy(asc(orders.createdAt));
  },

  async create(db: DB, data: NewOrder): Promise<Order> {
    const rows = await db.insert(orders).values(data).returning();
    return rows[0];
  },

  async markReconciled(db: DB, id: string): Promise<void> {
    await db
      .update(orders)
      .set({ status: "reconciled", updatedAt: new Date().toISOString() })
      .where(eq(orders.id, id));
  },

  async weeklyStats(db: DB) {
    const rows = await db
      .select({
        total: sql<number>`count(*)`,
        totalPaid: sql<number>`coalesce(sum(${orders.amountPaid}), 0)`,
        avgOrder: sql<number>`coalesce(avg(${orders.amountPaid}), 0)`,
        pending: sql<number>`sum(case when ${orders.status} = 'pending' then 1 else 0 end)`,
      })
      .from(orders)
      .where(sql`${orders.createdAt} >= datetime('now', '-7 days')`);
    return rows[0];
  },
};
