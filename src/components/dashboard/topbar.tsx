"use client"

import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDashboardContext } from "@/components/dashboard/dashboard-context"

type TopbarProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}

export function Topbar({
  title,
  subtitle,
  actions,
  leading,
  trailing,
  className,
}: TopbarProps) {
  const { toggleMobileSidebar } = useDashboardContext()

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-pos-border-tertiary bg-pos-bg-primary px-6 py-4",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggleMobileSidebar}
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-pos-border-secondary text-pos-text-secondary hover:bg-pos-bg-secondary lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </button>
        {leading}
        <div className="min-w-0">
          <h2 className="text-[16px] font-medium text-pos-text-primary">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-[12px] text-pos-text-secondary">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {trailing}
      </div>
    </div>
  )
}
