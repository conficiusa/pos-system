import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { user } from "./better-auth.schema";
import { GrantableRole } from "@/services/access/access.service";

export const userRole = sqliteTable(
  "user_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").$type<GrantableRole>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const userRoleChangelog = sqliteTable(
  "user_role_changelog",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").$type<GrantableRole>().notNull(),
    action: text("action").notNull().$type<"grant" | "revoke">(),
    date: integer("date", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role, table.date] })],
);
export type UserRoleChangelog = typeof userRoleChangelog.$inferSelect;
