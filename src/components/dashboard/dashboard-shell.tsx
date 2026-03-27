import { cn } from "@/lib/utils"
import { Sidebar, type NavKey, type SidebarUser } from "@/components/dashboard/sidebar"

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
  return (
    <div
      className={cn(
        "grid h-screen grid-cols-[220px_minmax(0,1fr)] overflow-hidden rounded-lg border border-pos-border-tertiary",
        className
      )}
    >
      <Sidebar activeItem={activeItem} user={user} />
      <div className={cn("flex min-w-0 flex-col overflow-y-auto bg-pos-bg-tertiary", mainClassName)}>
        {children}
      </div>
    </div>
  )
}
