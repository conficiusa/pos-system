"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  type NavKey,
  type SidebarUser,
} from "@/components/dashboard/sidebar";
import { DashboardContext } from "@/components/dashboard/dashboard-context";
import { SyncStatusBar } from "@/components/dashboard/sync-status-bar";

type DashboardShellProps = {
  activeItem: NavKey;
  children: React.ReactNode;
  user?: SidebarUser;
  className?: string;
  mainClassName?: string;
};

export function DashboardShell({
  activeItem,
  children,
  user,
  className,
  mainClassName,
}: DashboardShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <DashboardContext.Provider
      value={{ toggleMobileSidebar: () => setMobileSidebarOpen((v) => !v) }}
    >
      <div
        className={cn(
          "relative h-svh overflow-hidden rounded-lg border border-pos-border-tertiary",
          "lg:grid lg:grid-cols-[220px_minmax(0,1fr)]",
          className,
        )}
      >
        {/* Mobile backdrop */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        <Sidebar
          activeItem={activeItem}
          user={user}
          mobileSidebarOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div
          className={cn(
            "flex h-full min-w-0 min-h-0 flex-col bg-pos-bg-tertiary",
            mainClassName,
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-scroll overscroll-y-contain [scrollbar-gutter:stable]">
            {children}
          </div>
          <SyncStatusBar />
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
