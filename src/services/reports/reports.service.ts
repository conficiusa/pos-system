import { desc, eq, sql } from "drizzle-orm"
import { DB } from "@/lib/db"
import { customers, orders, valuations } from "@/lib/db/schemas"
import { orderQueries } from "@/services/orders/orders.dal"
import { ledgerQueries } from "@/services/valuation/valuation"

// ─── Reports service ──────────────────────────────────────────────────────────

export const reportsService = {
  async getStats(db: DB) {
    const [weeklyOrders, ledger] = await Promise.all([
      orderQueries.weeklyStats(db),
      ledgerQueries.summaryStats(db),
    ])
    return { weeklyOrders, ledger }
  },

  async getChartData(db: DB) {
    const [weeklyPayouts, topCustomers, reconciliation] =
      await Promise.all([
        // Weekly payouts — last 8 weeks grouped by ISO week
        db
          .select({
            week: sql<string>`strftime('%Y-W%W', datetime(${orders.createdAt}))`,
            totalPaid: sql<number>`coalesce(sum(${orders.amountPaid}), 0)`,
            orderCount: sql<number>`count(*)`,
          })
          .from(orders)
          .where(sql`${orders.createdAt} >= datetime('now', '-56 days')`)
          .groupBy(sql`strftime('%Y-W%W', datetime(${orders.createdAt}))`)
          .orderBy(sql`strftime('%Y-W%W', datetime(${orders.createdAt}))`),

        // Top 10 customers by total payout
        db
          .select({
            customerId: orders.customerId,
            name: customers.name,
            totalPaid: sql<number>`coalesce(sum(${orders.amountPaid}), 0)`,
          })
          .from(orders)
          .innerJoin(customers, eq(orders.customerId, customers.id))
          .groupBy(orders.customerId)
          .orderBy(desc(sql<number>`sum(${orders.amountPaid})`))
          .limit(10),

        // Reconciliation accuracy stats from valuations table
        db
          .select({
            total: sql<number>`count(*)`,
            avgDelta: sql<number>`coalesce(avg(abs(${valuations.delta})), 0)`,
            underpaidCount: sql<number>`sum(case when ${valuations.delta} > 0.01 then 1 else 0 end)`,
            overpaidCount: sql<number>`sum(case when ${valuations.delta} < -0.01 then 1 else 0 end)`,
            exactCount: sql<number>`sum(case when abs(${valuations.delta}) <= 0.01 then 1 else 0 end)`,
            avgErrorRate: sql<number>`coalesce(avg(case when ${orders.estimatedValue} > 0 then abs(${valuations.delta}) / ${orders.estimatedValue} else null end), 0)`,
          })
          .from(valuations)
          .innerJoin(orders, eq(valuations.orderId, orders.id)),
      ])

    return {
      weeklyPayouts,
      topCustomers,
      reconciliation: reconciliation[0] ?? {
        total: 0,
        avgDelta: 0,
        underpaidCount: 0,
        overpaidCount: 0,
        exactCount: 0,
        avgErrorRate: 0,
      },
    }
  },
}
