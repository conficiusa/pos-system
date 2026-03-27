import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { orders } from "./orders.schema";
import { user } from "./better-auth.schema";

export const valuations = sqliteTable(
  "valuations",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique() // one valuation per order
      .references(() => orders.id),
    processedBy: text("processed_by")
      .notNull()
      .references(() => user.id),

    trueRate: real("true_rate").notNull(), // actual GHS per gram of fine gold
    trueValue: real("true_value").notNull(), // fine_weight * true_rate
    // delta = true_value - estimated_value
    // positive → customer was underpaid → credit posted to their ledger
    // negative → customer was overpaid  → arrears posted to their ledger
    delta: real("delta").notNull(),

    processedAt: text("processed_at").notNull(),
  },
  (t) => [index("valuations_order_idx").on(t.orderId)],
);



export type Valuation = typeof valuations.$inferSelect;
export type NewValuation = typeof valuations.$inferInsert;
