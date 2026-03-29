"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Sidebar, type NavKey, type SidebarUser } from "@/components/dashboard/sidebar"
import { DashboardContext } from "@/components/dashboard/dashboard-context"

type DashboardShellProps = {
  activeItem: NavKey
  children: React.ReactNode
  user?: SidebarUser
  className?: string
  mainClassName?: string
}

export function DashboardShell({
  activeItem,
  children,
  user,
  className,
  mainClassName,
}: DashboardShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  return (
    <DashboardContext.Provider value={{ toggleMobileSidebar: () => setMobileSidebarOpen((v) => !v) }}>
      <div
        className={cn(
          "relative h-screen overflow-hidden rounded-lg border border-pos-border-tertiary",
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

        <div className={cn("flex h-full min-w-0 flex-col overflow-y-auto bg-pos-bg-tertiary", mainClassName)}>
          {children}
        </div>
      </div>
    </DashboardContext.Provider>
  )
}
