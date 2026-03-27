import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { timestamps } from "./utils.schema";
import { customers } from "./customers.schema";
import { user } from "./better-auth.schema";

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),

    // Gold details
    weightGrams: real("weight_grams").notNull(),

    // Financials at time of intake
    estimatedRate: real("estimated_rate").notNull(), // GHS per gram of gold
    estimatedValue: real("estimated_value").notNull(), // weight_grams * estimated_rate
    ledgerAdjustment: real("ledger_adjustment").notNull().default(0),
    // ^ credit (+) or arrears (-) carried from customer's prior balance
    amountPaid: real("amount_paid").notNull(), // estimated_value + ledger_adjustment

    notes: text("notes"),

    // Human-readable order number assigned server-side on first sync.
    // Null for orders not yet synced to the server.
    orderSeq: integer("order_seq"),    // sequential counter within the year
    orderYear: integer("order_year"),  // 4-digit year, used to scope the counter
    orderNumber: text("order_number"), // formatted: ORD-0001-26

    // 'pending'     → awaiting Thursday valuation
    // 'reconciled'  → true value confirmed, ledger updated
    status: text("status", { enum: ["pending", "reconciled"] })
      .notNull()
      .default("pending"),

    ...timestamps,
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
    index("orders_number_idx").on(t.orderYear, t.orderSeq),
  ],
);


export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;