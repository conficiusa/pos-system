"use client";

import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

/**
 * Returns the current online/offline state from TanStack Query's onlineManager.
 *
 * The onlineManager is updated centrally in QueryProvider using both browser
 * online/offline events and an active same-origin connectivity probe, so this
 * hook reflects the same source of truth used by React Query itself.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const isOnline = useSyncExternalStore(
    (onStoreChange) => onlineManager.subscribe(onStoreChange),
    () => onlineManager.isOnline(),
    () => true,
  );

  return { isOnline };
}
