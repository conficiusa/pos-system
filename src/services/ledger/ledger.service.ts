import { DB } from "@/lib/db"
import { ledgerQueries } from "@/services/valuation/valuation"

// ─── Ledger service ───────────────────────────────────────────────────────────

export const ledgerService = {
  list(
    db: DB,
    opts: {
      type?: "payout" | "credit" | "debit"
      customerId?: string
      page?: number
      perPage?: number
    } = {},
  ) {
    return ledgerQueries.list(db, opts)
  },

  summaryStats(db: DB) {
    return ledgerQueries.summaryStats(db)
  },
}
