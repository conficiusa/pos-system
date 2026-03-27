import { DB } from "@/lib/db";
import { eq, asc, sql } from "drizzle-orm";
import { syncQueue, SyncQueueEntry, NewSyncQueueEntry, ConflictResolution } from "@/lib/db/schemas";

export const syncQueueQueries = {
  async getPending(db: DB): Promise<SyncQueueEntry[]> {
    return db
      .select()
      .from(syncQueue)
      .where(eq(syncQueue.synced, false))
      .orderBy(asc(syncQueue.createdAt));
  },

  async upsert(db: DB, data: NewSyncQueueEntry): Promise<void> {
    await db
      .insert(syncQueue)
      .values(data)
      .onConflictDoUpdate({
        target: syncQueue.id,
        set: {
          payload: data.payload,
          clientTimestamp: data.clientTimestamp,
        },
      });
  },

  async markSynced(db: DB, id: string, resolution?: ConflictResolution): Promise<void> {
    await db
      .update(syncQueue)
      .set({
        synced: true,
        syncedAt: new Date().toISOString(),
        conflictResolution: resolution ?? null,
      })
      .where(eq(syncQueue.id, id));
  },

  async getPendingCount(db: DB): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(syncQueue)
      .where(eq(syncQueue.synced, false));
    return rows[0]?.count ?? 0;
  },
};
