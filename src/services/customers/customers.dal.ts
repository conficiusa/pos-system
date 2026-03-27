import { eq, like, or, asc, sql } from "drizzle-orm";
import {
  customers,
  type Customer,
  type NewCustomer,
} from "@/lib/db/schemas/customers.schema";
import { DB } from "@/lib/db";
import { orders } from "@/lib/db/schemas";
import { paginate, PaginatedResult } from "@/services/utils/dal.utils";

// ─── Customers ───────────────────────────────────────────────────────────────

export const customerQueries = {
  async list(
    db: DB,
    page = 1,
    perPage = 50,
  ): Promise<PaginatedResult<Customer>> {
    const { limit, offset } = paginate(page, perPage);
    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(customers)
        .orderBy(asc(customers.name))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(customers),
    ]);
    return { data, total, page, perPage };
  },

  async search(db: DB, query: string): Promise<Customer[]> {
    const q = `%${query}%`;
    return db
      .select()
      .from(customers)
      .where(or(like(customers.name, q), like(customers.phone, q)))
      .orderBy(asc(customers.name))
      .limit(20);
  },

  async getById(db: DB, id: string): Promise<Customer | undefined> {
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return rows[0];
  },

  async getByPhone(db: DB, phone: string): Promise<Customer | undefined> {
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, phone))
      .limit(1);
    return rows[0];
  },

  async create(db: DB, data: NewCustomer): Promise<Customer> {
    const rows = await db.insert(customers).values(data).returning();
    return rows[0];
  },

  async update(
    db: DB,
    id: string,
    data: Partial<NewCustomer>,
  ): Promise<Customer> {
    const rows = await db
      .update(customers)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(customers.id, id))
      .returning();
    return rows[0];
  },

  async adjustBalance(db: DB, id: string, delta: number): Promise<void> {
    await db
      .update(customers)
      .set({
        ledgerBalance: sql`${customers.ledgerBalance} + ${delta}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(customers.id, id));
  },

  async withStats(db: DB, id: string) {
    const rows = await db
      .select({
        customer: customers,
        orderCount: sql<number>`count(${orders.id})`,
        totalPaid: sql<number>`coalesce(sum(${orders.amountPaid}), 0)`,
      })
      .from(customers)
      .leftJoin(orders, eq(orders.customerId, customers.id))
      .where(eq(customers.id, id))
      .groupBy(customers.id)
      .limit(1);
    return rows[0];
  },
};
