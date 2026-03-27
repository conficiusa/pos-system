import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm/sql/sql";

export const syncQueue = sqliteTable(
  "sync_queue",
  {
    id: text("id").primaryKey(),
    tableName: text("table_name").notNull(),
    recordId: text("record_id").notNull(),
    operation: text("operation", { enum: ["insert", "update"] })
      .$type<SyncOperation>()
      .notNull(),
    payload: text("payload").notNull(), // JSON string
    clientTimestamp: text("client_timestamp").notNull(),
    synced: integer("synced", { mode: "boolean" }).notNull().default(false),
    syncedAt: text("synced_at"),
    // null | 'server-wins' | 'client-wins' | 'merged'
    conflictResolution: text("conflict_resolution").$type<ConflictResolution>(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("sync_queue_synced_idx").on(t.synced, t.createdAt),
    index("sync_queue_table_idx").on(t.tableName),
  ],
);
export type SyncOperation = "insert" | "update";
export type ConflictResolution = "server-wins" | "client-wins" | "merged";
export type SyncQueueEntry = typeof syncQueue.$inferSelect;
export type NewSyncQueueEntry = typeof syncQueue.$inferInsert;
