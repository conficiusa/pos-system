"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current online/offline state of the browser.
 * Listens to the `online` and `offline` window events and updates reactively.
 *
 * Note: navigator.onLine can return `true` even without real connectivity
 * (e.g. connected to a router with no internet). Treat it as an optimistic
 * signal, not a guarantee.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
