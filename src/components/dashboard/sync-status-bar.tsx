"use client";

import { useNetworkStatus } from "@/hooks/use-network-status";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { cn } from "@/lib/utils";

/**
 * A non-intrusive bar shown at the bottom of the dashboard shell.
 * Visible only when:
 *   - The device is offline, OR
 *   - There are pending sync queue entries, OR
 *   - There are permanently failed sync entries needing attention
 *
 * Never blocks user action — purely informational.
 */
export function SyncStatusBar() {
  const { isOnline } = useNetworkStatus();
  const { pendingCount, failedIds, isSyncing, triggerSync } = useSyncStatus();

  const hasFailed = failedIds.length > 0;
  const hasPending = pendingCount > 0;

  // Nothing to show when online with no pending/failed items.
  if (isOnline && !hasPending && !hasFailed) return null;

  if (!isOnline) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-t border-pos-border-tertiary",
          "bg-pos-warning-soft px-4 py-2 text-[12px] text-pos-warning",
        )}
        role="status"
        aria-live="polite"
      >
        <span className="size-2 shrink-0 rounded-full bg-pos-warning" />
        <span className="flex-1">
          Offline — changes saved locally and will sync when you reconnect.
          {hasPending ? ` ${pendingCount} item${pendingCount !== 1 ? "s" : ""} pending.` : ""}
        </span>
      </div>
    );
  }

  if (hasFailed) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-t border-pos-border-tertiary",
          "bg-pos-danger-soft px-4 py-2 text-[12px] text-pos-danger",
        )}
        role="alert"
        aria-live="assertive"
      >
        <span className="size-2 shrink-0 rounded-full bg-pos-danger" />
        <span className="flex-1">
          {failedIds.length} item{failedIds.length !== 1 ? "s" : ""} failed to sync after 3 attempts. Please contact support.
        </span>
      </div>
    );
  }

  if (hasPending) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 border-t border-pos-border-tertiary",
          "bg-pos-bg-secondary px-4 py-2 text-[12px] text-pos-text-secondary",
        )}
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            isSyncing ? "animate-pulse bg-pos-brand" : "bg-pos-warning",
          )}
        />
        <span className="flex-1">
          {isSyncing
            ? "Syncing…"
            : `${pendingCount} item${pendingCount !== 1 ? "s" : ""} pending sync.`}
        </span>
        {!isSyncing && (
          <button
            onClick={triggerSync}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-pos-brand underline-offset-2 hover:underline"
          >
            Sync now
          </button>
        )}
      </div>
    );
  }

  return null;
}
