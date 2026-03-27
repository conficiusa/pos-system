import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { customers } from "./customers.schema";
import { orders } from "./orders.schema";
import { valuations } from "./valuations.schema";
import { user } from "./better-auth.schema";
import { sql } from "drizzle-orm/sql/sql";

export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    orderId: text("order_id").references(() => orders.id),
    valuationId: text("valuation_id").references(() => valuations.id),

    // positive = money owed to customer (credit)
    // negative = money owed to business (debit / arrears)
    amount: real("amount").notNull(),
    type: text("type", { enum: ["payout", "credit", "debit", "settlement"] }).notNull(),
    description: text("description").notNull(),

    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),

    // ledger_entries are NEVER updated or deleted — append only
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("ledger_customer_idx").on(t.customerId),
    index("ledger_order_idx").on(t.orderId),
    index("ledger_created_idx").on(t.createdAt),
  ],
);

export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
