import { nanoid } from "nanoid"
import { DB } from "@/lib/db"
import { orderQueries } from "@/services/orders/orders.dal"
import { valuationQueries, ledgerQueries } from "./valuation"
import { customerQueries } from "@/services/customers/customers.dal"

// ─── Valuations service ───────────────────────────────────────────────────────

export const valuationsService = {
  /**
   * Process a Thursday reconciliation for a single order.
   * Atomically: creates the valuation, marks the order reconciled,
   * posts a ledger entry (if delta is non-trivial), and adjusts the
   * customer's running ledger balance.
   */
  async process(
    db: DB,
    {
      orderId,
      trueRate,
      processedBy,
    }: { orderId: string; trueRate: number; processedBy: string },
  ) {
    if (!orderId) throw new Error("orderId is required")
    if (typeof trueRate !== "number" || trueRate <= 0) {
      throw new Error("trueRate must be a positive number")
    }

    const order = await orderQueries.getById(db, orderId)
    if (!order) throw new Error("Order not found")
    if (order.status === "reconciled") throw new Error("Order already reconciled")

    const trueValue = order.weightGrams * trueRate
    const delta = trueValue - order.estimatedValue
    const now = new Date().toISOString()

    // 1. Create valuation record
    const valuation = await valuationQueries.create(db, {
      id: nanoid(),
      orderId,
      processedBy,
      trueRate,
      trueValue,
      delta,
      processedAt: now,
    })

    // 2. Mark order reconciled
    await orderQueries.markReconciled(db, orderId)

    // 3. Post ledger entry + adjust customer balance (only if delta is non-trivial)
    if (Math.abs(delta) >= 0.01) {
      const type = delta > 0 ? "credit" : "debit"
      const description =
        delta > 0
          ? "Reconciliation — underpayment credit"
          : "Reconciliation — overpayment arrears"

      await ledgerQueries.create(db, {
        id: nanoid(),
        customerId: order.customerId,
        orderId,
        valuationId: valuation.id,
        amount: delta,
        type,
        description,
        createdBy: processedBy,
        createdAt: now,
      })

      await customerQueries.adjustBalance(db, order.customerId, delta)
    }

    return valuation
  },

  listWithOrders(db: DB, page = 1, perPage = 50) {
    return valuationQueries.listWithOrders(db, page, perPage)
  },
}
