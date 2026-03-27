export * from "drizzle-orm/d1";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { timestamps } from "./utils.schema";
import { user } from "./better-auth.schema";

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone").notNull().unique(),
    idType: text("id_type"), // 'Ghana Card' | 'Passport' | 'Voter ID' | 'SSNIT'
    idNumber: text("id_number"),
    notes: text("notes"),
    // Running ledger balance.
    // Positive  → business owes customer (credit from prior underpayment)
    // Negative  → customer owes business (arrears from prior overpayment)
    ledgerBalance: real("ledger_balance").notNull().default(0),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customers_phone_idx").on(t.phone),
    index("customers_name_idx").on(t.name),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;