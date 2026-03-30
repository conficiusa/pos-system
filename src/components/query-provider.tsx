"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { HYDRATION_COMPLETE_EVENT } from "@/services/sync/idb";

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
    // When hydrateFromServer() completes it dispatches HYDRATION_COMPLETE_EVENT.
    // Invalidating here causes all active queries (customers, orders, etc.) to
    // re-execute their queryFn, which will now find fresh data in IDB.
    function onHydrated() {
      queryClient.invalidateQueries().catch(console.warn);
    }

    window.addEventListener(HYDRATION_COMPLETE_EVENT, onHydrated);
    return () => window.removeEventListener(HYDRATION_COMPLETE_EVENT, onHydrated);
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
