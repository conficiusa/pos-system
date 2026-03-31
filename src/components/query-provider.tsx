"use client";

import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HYDRATION_COMPLETE_EVENT } from "@/services/sync/idb";

const CONNECTIVITY_CHECK_URL = "/api/ping";
const CONNECTIVITY_CHECK_INTERVAL_MS = 15_000;
const CONNECTIVITY_CHECK_TIMEOUT_MS = 4_000;

async function probeConnectivity(signal: AbortSignal): Promise<boolean | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  try {
    const res = await fetch(CONNECTIVITY_CHECK_URL, {
      method: "HEAD",
      cache: "no-store",
      signal,
    });

    return res.ok;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    return false;
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime: 0 — always re-read from IDB/network on mount.
            // This is critical for offline-first: after hydrateFromServer()
            // writes fresh data to IDB, the next render must pick it up.
            // 60s staleTime was the root cause of empty customer lists after
            // the first hydration completed.
            staleTime: 0,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    let disposed = false;
    let activeController: AbortController | null = null;
    let probeSequence = 0;

    async function refreshOnlineState() {
      activeController?.abort();

      const controller = new AbortController();
      activeController = controller;
      const probeId = ++probeSequence;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, CONNECTIVITY_CHECK_TIMEOUT_MS);

      try {
        const reachable = await probeConnectivity(controller.signal);
        if (
          !disposed &&
          activeController === controller &&
          probeId === probeSequence
        ) {
          if (reachable === null) {
            if (timedOut) {
              onlineManager.setOnline(false);
            }
            return;
          }

          onlineManager.setOnline(reachable);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (activeController === controller) {
          activeController = null;
        }
      }
    }

    function handleOnline() {
      void refreshOnlineState();
    }

    function handleOffline() {
      onlineManager.setOnline(false);
    }

    function handleVisibilityChange() {
      if (!document.hidden) {
        void refreshOnlineState();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void refreshOnlineState();

    const intervalId = window.setInterval(() => {
      if (!document.hidden && onlineManager.isOnline()) {
        void refreshOnlineState();
      }
    }, CONNECTIVITY_CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    // When hydrateFromServer() completes it dispatches HYDRATION_COMPLETE_EVENT.
    // Invalidating here causes all active queries (customers, orders, etc.) to
    // re-execute their queryFn, which will now find fresh data in IDB.
    function onHydrated() {
      queryClient.invalidateQueries().catch(console.warn);
    }

    window.addEventListener(HYDRATION_COMPLETE_EVENT, onHydrated);
    return () =>
      window.removeEventListener(HYDRATION_COMPLETE_EVENT, onHydrated);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
