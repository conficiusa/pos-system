import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.schema";

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id),
});

export type AppSetting = typeof appSettings.$inferSelect;
