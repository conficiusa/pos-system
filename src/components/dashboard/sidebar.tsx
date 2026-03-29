"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import {
  IconCustomers,
  IconLedger,
  IconNewOrder,
  IconOrders,
  IconReports,
  IconReconciliation,
  IconSettings,
} from "@/components/dashboard/icons";
import { Button } from "../ui/button";
import { LogOut } from "lucide-react";

export type NavKey =
  | "new-order"
  | "customers"
  | "orders"
  | "ledger"
  | "reconciliation"
  | "reports"
  | "settings";

const navItems = [
  {
    id: "new-order" as const,
    label: "New order",
    href: "/new-order",
    icon: IconNewOrder,
  },
  {
    id: "customers" as const,
    label: "Customers",
    href: "/customers",
    icon: IconCustomers,
  },
  {
    id: "orders" as const,
    label: "Orders",
    href: "/",
    icon: IconOrders,
  },
  {
    id: "ledger" as const,
    label: "Ledger",
    href: "/ledger",
    icon: IconLedger,
  },
  {
    id: "reconciliation" as const,
    label: "Reconciliation",
    href: "/reconciliation",
    icon: IconReconciliation,
  },
  {
    id: "reports" as const,
    label: "Reports",
    href: "/reports",
    icon: IconReports,
  },
  {
    id: "settings" as const,
    label: "Settings",
    href: "/settings",
    icon: IconSettings,
  },
];

export type SidebarUser = {
  name: string;
  role: string;
  initials: string;
  accent?: { bg: string; text: string };
};

const defaultUser: SidebarUser = {
  name: "Kofi Agyeman",
  role: "Cashier",
  initials: "KA",
  accent: { bg: "var(--pos-brand-soft)", text: "var(--pos-brand-dark)" },
};

type SidebarProps = {
  activeItem: NavKey;
  user?: SidebarUser;
  branch?: string;
  mobileSidebarOpen?: boolean;
  onMobileClose?: () => void;
};

export function Sidebar({
  activeItem,
  user = defaultUser,
  branch = "Main branch",
  mobileSidebarOpen = false,
  onMobileClose,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col gap-2 border-r border-pos-border-tertiary bg-pos-bg-secondary py-4",
        // Mobile: fixed slide-over from left
        "fixed inset-y-0 left-0 z-50 w-[220px] transition-transform duration-200 ease-in-out",
        mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop: static in grid, reset mobile overrides
        "lg:relative lg:inset-auto lg:w-auto lg:translate-x-0",
      )}
    >
      <div className="px-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[14px] font-medium text-pos-text-primary">GoldPOS</p>
            <p className="mt-1 text-[13px] text-pos-text-secondary">{branch}</p>
          </div>
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="flex size-6 items-center justify-center rounded-md text-pos-text-secondary hover:bg-pos-bg-primary hover:text-pos-text-primary lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="border-t border-pos-border-tertiary" />
      <nav className="flex flex-col gap-0.5 pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-[13px] text-pos-text-secondary transition",
                "hover:bg-pos-bg-primary hover:text-pos-text-primary",
                isActive &&
                  "border-r-2 border-pos-brand bg-pos-bg-primary font-medium text-pos-text-primary",
              )}
            >
              <Icon className="size-[15px]" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-pos-border-tertiary px-4 pt-4">
        <div className="flex items-center gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium"
            style={{ background: user.accent?.bg, color: user.accent?.text }}
          >
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-pos-text-primary">
              {user.name}
            </p>
            <p className="text-[11px] text-pos-text-secondary">{user.role}</p>
          </div>
          <Button
            size={"icon"}
            variant={"outline"}
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = "/login";
                  },
                },
              })
            }
            className="shrink-0 rounded-[var(--radius-md)] border border-pos-border-secondary px-2 py-1 text-[11px] text-pos-text-secondary hover:bg-pos-bg-primary hover:text-pos-danger"
            title="Sign out"
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  );
}
