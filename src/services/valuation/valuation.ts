import { DB } from "@/lib/db";
import {
  customers,
  ledgerEntries,
  LedgerEntry,
  NewLedgerEntry,
  NewValuation,
  orders,
  Valuation,
  valuations,
} from "@/lib/db/schemas";
import { user } from "@/lib/db/schemas/better-auth.schema";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { paginate } from "@/services/utils/dal.utils";

export const valuationQueries = {
  async create(db: DB, data: NewValuation): Promise<Valuation> {
    const rows = await db.insert(valuations).values(data).returning();
    return rows[0];
  },

  async getByOrderId(db: DB, orderId: string): Promise<Valuation | undefined> {
    const rows = await db
      .select()
      .from(valuations)
      .where(eq(valuations.orderId, orderId))
      .limit(1);
    return rows[0];
  },

  async listWithOrders(db: DB, page = 1, perPage = 50) {
    const { limit, offset } = paginate(page, perPage);
    return db
      .select({
        id: valuations.id,
        orderId: valuations.orderId,
        trueRate: valuations.trueRate,
        trueValue: valuations.trueValue,
        delta: valuations.delta,
        processedAt: valuations.processedAt,
        orderWeightGrams: orders.weightGrams,
        orderEstimatedValue: orders.estimatedValue,
        customerName: customers.name,
      })
      .from(valuations)
      .innerJoin(orders, eq(valuations.orderId, orders.id))
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .orderBy(desc(valuations.processedAt))
      .limit(limit)
      .offset(offset);
  },
};

// ─── Ledger entries ──────────────────────────────────────────────────────────

export const ledgerQueries = {
  async list(
    db: DB,
    opts: {
      type?: "payout" | "credit" | "debit";
      customerId?: string;
      page?: number;
      perPage?: number;
    } = {},
  ) {
    const { type, customerId, page = 1, perPage = 50 } = opts;
    const { limit, offset } = paginate(page, perPage);

    const conditions = [];
    if (type) conditions.push(eq(ledgerEntries.type, type));
    if (customerId) conditions.push(eq(ledgerEntries.customerId, customerId));
    const where = conditions.length ? and(...conditions) : undefined;

    const orderStaff = alias(user, "order_staff");
    const reconcileStaff = alias(user, "reconcile_staff");

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          ...getTableColumns(ledgerEntries),
          customerName: customers.name,
          orderNumber: orders.orderNumber,
          orderCreatedByName: orderStaff.name,
          reconciledByName: reconcileStaff.name,
        })
        .from(ledgerEntries)
        .innerJoin(customers, eq(ledgerEntries.customerId, customers.id))
        .leftJoin(orders, eq(ledgerEntries.orderId, orders.id))
        .leftJoin(orderStaff, eq(orders.createdBy, orderStaff.id))
        .leftJoin(valuations, eq(ledgerEntries.valuationId, valuations.id))
        .leftJoin(reconcileStaff, eq(valuations.processedBy, reconcileStaff.id))
        .where(where)
        .orderBy(desc(ledgerEntries.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(ledgerEntries)
        .where(where),
    ]);

    return { data, total, page, perPage };
  },

  async create(db: DB, data: NewLedgerEntry): Promise<LedgerEntry> {
    const rows = await db.insert(ledgerEntries).values(data).returning();
    return rows[0];
  },

  async summaryStats(db: DB) {
    const rows = await db
      .select({
        totalCredits: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'credit' then ${ledgerEntries.amount} else 0 end), 0)`,
        totalDebits: sql<number>`coalesce(sum(case when ${ledgerEntries.type} = 'debit' then abs(${ledgerEntries.amount}) else 0 end), 0)`,
        customersWithCredit: sql<number>`count(distinct case when ${ledgerEntries.type} = 'credit' then ${ledgerEntries.customerId} end)`,
        customersWithDebit: sql<number>`count(distinct case when ${ledgerEntries.type} = 'debit' then ${ledgerEntries.customerId} end)`,
      })
      .from(ledgerEntries);
    return rows[0];
  },
};
