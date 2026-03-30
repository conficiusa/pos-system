"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  flushSyncQueue,
  getPendingSyncCount,
  getFailedSyncIds,
  HYDRATION_COMPLETE_EVENT,
} from "@/services/sync/idb";

interface SyncStatus {
  /** Number of entries in the sync queue not yet confirmed by the server. */
  pendingCount: number;
  /** IDs of sync queue entries that have permanently failed (>= 3 retries). */
  failedIds: string[];
  /** Whether a sync flush is currently in progress. */
  isSyncing: boolean;
  /** ISO timestamp of the last successful flush, or null if never. */
  lastSyncedAt: string | null;
  /** Manually trigger a sync flush. */
  triggerSync: () => void;
}

const LAST_SYNCED_KEY = "pos-last-synced-at";

export function useSyncStatus(): SyncStatus {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(LAST_SYNCED_KEY);
  });
  const isMountedRef = useRef(true);

  const refreshCounts = useCallback(async () => {
    try {
      const count = await getPendingSyncCount();
      const failed = getFailedSyncIds();
      if (isMountedRef.current) {
        setPendingCount(count);
        setFailedIds(failed);
      }
    } catch {}
  }, []);

  const triggerSync = useCallback(() => {
    if (isSyncing) return;
    setIsSyncing(true);
    flushSyncQueue()
      .then(() => {
        const now = new Date().toISOString();
        try {
          localStorage.setItem(LAST_SYNCED_KEY, now);
        } catch {}
        if (isMountedRef.current) {
          setLastSyncedAt(now);
        }
      })
      .catch(console.warn)
      .finally(() => {
        if (isMountedRef.current) {
          setIsSyncing(false);
          refreshCounts().catch(console.warn);
        }
      });
  }, [isSyncing, refreshCounts]);

  // Refresh counts on mount and after hydration.
  useEffect(() => {
    refreshCounts().catch(console.warn);

    function onHydrated() {
      refreshCounts().catch(console.warn);
    }
    window.addEventListener(HYDRATION_COMPLETE_EVENT, onHydrated);
    return () => {
      window.removeEventListener(HYDRATION_COMPLETE_EVENT, onHydrated);
    };
  }, [refreshCounts]);

  // Refresh counts when coming back online.
  useEffect(() => {
    function onOnline() {
      refreshCounts().catch(console.warn);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshCounts]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return { pendingCount, failedIds, isSyncing, lastSyncedAt, triggerSync };
}
