import { asc, eq, like, or, sql } from "drizzle-orm"
import { nanoid } from "nanoid"
import { DB } from "@/lib/db"
import { customers, orders } from "@/lib/db/schemas"
import { customerQueries } from "./customers.dal"
import { paginate } from "@/services/utils/dal.utils"
import type { Customer, NewCustomer } from "@/lib/db/schemas"

// ─── List with order counts ────────────────────────────────────────────────────

export const customersService = {
  async list(db: DB, page = 1, perPage = 50) {
    const { limit, offset } = paginate(page, perPage)
    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          idType: customers.idType,
          idNumber: customers.idNumber,
          notes: customers.notes,
          ledgerBalance: customers.ledgerBalance,
          createdBy: customers.createdBy,
          createdAt: customers.createdAt,
          updatedAt: customers.updatedAt,
          orderCount: sql<number>`count(${orders.id})`,
        })
        .from(customers)
        .leftJoin(orders, eq(orders.customerId, customers.id))
        .groupBy(customers.id)
        .orderBy(asc(customers.name))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)` }).from(customers),
    ])
    return { data, total, page, perPage }
  },

  async search(db: DB, q: string) {
    const pattern = `%${q}%`
    return db
      .select({
        id: customers.id,
        name: customers.name,
        phone: customers.phone,
        idType: customers.idType,
        idNumber: customers.idNumber,
        notes: customers.notes,
        ledgerBalance: customers.ledgerBalance,
        createdBy: customers.createdBy,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt,
        orderCount: sql<number>`count(${orders.id})`,
      })
      .from(customers)
      .leftJoin(orders, eq(orders.customerId, customers.id))
      .where(or(like(customers.name, pattern), like(customers.phone, pattern)))
      .groupBy(customers.id)
      .orderBy(asc(customers.name))
      .limit(20)
  },

  async getWithStats(db: DB, id: string) {
    return customerQueries.withStats(db, id)
  },

  async create(
    db: DB,
    data: {
      name: string
      phone: string
      idType?: string | null
      idNumber?: string | null
      notes?: string | null
      createdBy: string
      id?: string
      createdAt?: string
      updatedAt?: string
    },
  ): Promise<Customer> {
    if (!data.name?.trim()) throw new Error("name is required")
    if (!data.phone?.trim()) throw new Error("phone is required")
    const now = new Date().toISOString()
    return customerQueries.create(db, {
      id: data.id ?? nanoid(),
      name: data.name.trim(),
      phone: data.phone.trim(),
      idType: data.idType ?? null,
      idNumber: data.idNumber ?? null,
      notes: data.notes ?? null,
      ledgerBalance: 0,
      createdBy: data.createdBy,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    } satisfies NewCustomer)
  },
}
