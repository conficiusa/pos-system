"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useDashboardContext } from "@/components/dashboard/dashboard-context";

export function RequiresNetwork({ children }: { children: ReactNode }) {
  const { isOnline } = useNetworkStatus();
  const { toggleMobileSidebar } = useDashboardContext();

  if (!isOnline) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pos-border-tertiary bg-pos-bg-primary px-6 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={toggleMobileSidebar}
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-pos-border-secondary text-pos-text-secondary hover:bg-pos-bg-secondary lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </button>
            <div className="min-w-0">
              <h2 className="text-[16px] font-medium text-pos-text-primary">
                Offline
              </h2>
              <p className="mt-1 text-[12px] text-pos-text-secondary">
                This page needs internet. Use the menu to return to Customers or
                New order.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-10 text-pos-text-tertiary"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <p className="text-[14px] font-medium text-pos-text-primary">
            No internet connection
          </p>
          <p className="max-w-sm text-[13px] text-pos-text-secondary">
            This page requires internet access to load. Customers and New order
            remain available offline.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
