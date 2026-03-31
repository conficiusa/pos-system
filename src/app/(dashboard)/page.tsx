"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  IconChevron,
  IconExport,
  IconSearch,
} from "@/components/dashboard/icons";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { cn, exportXlsx, fmtGHS } from "@/lib/utils";
import { useSessionContext } from "@/components/dashboard/session-guard";
import { localGetAll } from "@/services/sync/idb";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { printOrderReceipt } from "@/lib/print-receipt";
import { RequiresNetwork } from "@/components/dashboard/requires-network";

type OrderWithCustomer = {
  id: string;
  orderNumber: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  weightGrams: number;
  estimatedRate: number;
  estimatedValue: number;
  amountPaid: number;
  notes: string | null;
  status: string;
};

const displayId = (o: Pick<OrderWithCustomer, "id" | "orderNumber">) =>
  o.orderNumber ?? `#${o.id.slice(0, 6).toUpperCase()}`;

type WeeklyStats = {
  total: number;
  totalPaid: number;
  avgOrder: number;
  pending: number;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const filterButtons = [
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "reconciled", label: "Reconciled" },
];

const SkeletonRow = () => (
  <div className="grid grid-cols-[110px_1fr_90px_120px_120px_100px_40px] items-center gap-x-4 border-b border-pos-border-tertiary px-6 py-[11px]">
    <span className="inline-block h-3.5 w-16 animate-pulse rounded bg-pos-bg-secondary" />
    <div className="space-y-1.5">
      <span className="inline-block h-3.5 w-28 animate-pulse rounded bg-pos-bg-secondary" />
      <span className="block h-3 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    </div>
    <span className="inline-block h-3.5 w-10 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-5 w-16 animate-pulse rounded-full bg-pos-bg-secondary" />
    <span />
  </div>
);

export default function OrdersPage() {
  const { sidebarUser } = useSessionContext();
  const { isOnline } = useNetworkStatus();
  const [statusFilter, setStatusFilter] = useState<
    "" | "pending" | "reconciled"
  >("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ["reports-stats"],
    queryFn: async () => {
      try {
        const res = await apiFetch("/api/reports/stats");
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<{ weeklyOrders: WeeklyStats }>;
      } catch {
        const idbOrders = await localGetAll("orders");
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const weekly = idbOrders.filter(
          (o) => new Date(o.createdAt) >= oneWeekAgo,
        );
        return {
          weeklyOrders: {
            total: weekly.length,
            totalPaid: weekly.reduce((sum, o) => sum + o.amountPaid, 0),
            avgOrder:
              weekly.length > 0
                ? weekly.reduce((sum, o) => sum + o.estimatedValue, 0) /
                  weekly.length
                : 0,
            pending: idbOrders.filter((o) => o.status === "pending").length,
          },
        };
      }
    },
    enabled: isOnline,
  });
  const stats = statsQuery.data?.weeklyOrders ?? null;

  const ordersQuery = useQuery({
    queryKey: ["orders", statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (searchTerm.trim()) params.set("q", searchTerm.trim());
      const url = `/api/orders${params.toString() ? `?${params}` : ""}`;
      try {
        const res = await apiFetch(url);
        if (!res.ok) throw new Error(res.statusText);
        const data = (await res.json()) as { data: OrderWithCustomer[] };
        return data.data ?? [];
      } catch {
        const [idbOrders, idbCustomers] = await Promise.all([
          localGetAll("orders"),
          localGetAll("customers"),
        ]);
        const custMap = new Map(idbCustomers.map((c) => [c.id, c]));
        let result = idbOrders.map((o) => {
          const cust = custMap.get(o.customerId);
          return {
            ...o,
            customerName: cust?.name ?? "Unknown",
            customerPhone: cust?.phone ?? "",
          } as OrderWithCustomer;
        });
        if (statusFilter)
          result = result.filter((o) => o.status === statusFilter);
        if (searchTerm.trim()) {
          const q = searchTerm.trim().toLowerCase();
          result = result.filter(
            (o) =>
              o.customerName.toLowerCase().includes(q) ||
              (o.orderNumber?.toLowerCase().includes(q) ?? false),
          );
        }
        return result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      }
    },
    enabled: isOnline,
  });
  const orders = ordersQuery.data ?? [];

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  const handleExport = () => {
    exportXlsx(
      `orders-${new Date().toISOString().slice(0, 10)}`,
      "Orders",
      [
        "Order #",
        "Date",
        "Customer",
        "Phone",
        "Weight (g)",
        "Rate (GHS/g)",
        "Est. Value (GHS)",
        "Amount Paid (GHS)",
        "Status",
        "Notes",
      ],
      orders.map((o) => [
        displayId(o),
        fmtDate(o.createdAt),
        o.customerName,
        o.customerPhone,
        o.weightGrams,
        o.estimatedRate,
        o.estimatedValue,
        o.amountPaid,
        o.status,
        o.notes,
      ]),
    );
  };

  const metrics = [
    { label: "This week", value: stats ? stats.total + " orders" : "— orders" },
    {
      label: "Pending reconciliation",
      value: stats ? String(stats.pending ?? 0) : "—",
      valueClass: "text-pos-warning",
    },
    {
      label: "Total paid out",
      value: stats ? "GHS " + stats.totalPaid.toLocaleString() : "GHS —",
    },
    {
      label: "Avg. order value",
      value: stats
        ? "GHS " + Math.round(stats.avgOrder).toLocaleString()
        : "GHS —",
    },
  ];

  return (
    <DashboardShell activeItem="orders" user={sidebarUser}>
      <RequiresNetwork>
        <Topbar
          title="Orders"
          subtitle="All gold purchase orders"
          actions={
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={orders.length === 0}
              className="h-8 gap-2 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-3 text-[12px] font-medium text-pos-text-secondary"
            >
              <IconExport className="size-3.5" />
              Export
            </Button>
          }
        />

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[var(--radius-md)] border border-pos-border-tertiary bg-pos-bg-primary px-4 py-3"
              >
                <p className="text-[11px] text-pos-text-secondary">
                  {metric.label}
                </p>
                <p
                  className={cn(
                    "mt-1 text-[18px] font-medium text-pos-text-primary",
                    metric.valueClass,
                  )}
                >
                  {statsQuery.isLoading ? (
                    <span className="inline-block h-5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
                  ) : (
                    metric.value
                  )}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-pos-border-secondary bg-pos-bg-primary px-3">
              <IconSearch className="size-3.5 text-pos-text-tertiary" />
              <Input
                placeholder="Search by order ID or customer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 border-0 bg-transparent px-0 text-[13px] text-pos-text-primary placeholder:text-pos-text-tertiary focus-visible:ring-0"
              />
            </div>
            {filterButtons.map((filter) => (
              <Button
                key={filter.id}
                variant="outline"
                onClick={() =>
                  setStatusFilter(filter.id as "" | "pending" | "reconciled")
                }
                className={cn(
                  "h-8 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-3 text-[12px] font-medium text-pos-text-secondary",
                  statusFilter === filter.id &&
                    "border-pos-brand-mid bg-pos-brand-soft text-pos-brand-ink",
                )}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
            <div className="overflow-x-auto">
              <div className="grid min-w-[680px] grid-cols-[110px_1fr_90px_120px_120px_100px_40px] gap-x-4 border-b border-pos-border-tertiary bg-pos-bg-secondary px-6 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-pos-text-tertiary">
                <span>Order</span>
                <span>Customer</span>
                <span>Weight</span>
                <span>Est. value</span>
                <span>Paid out</span>
                <span>Status</span>
                <span />
              </div>
              <div className="min-w-[680px]">
                {ordersQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                ) : orders.length === 0 ? (
                  <div className="px-4 py-8 text-center text-[13px] text-pos-text-secondary">
                    No orders found.
                  </div>
                ) : (
                  orders.map((order) => {
                    const statusStyle =
                      order.status === "reconciled"
                        ? "bg-pos-success-soft text-pos-success"
                        : "bg-pos-warning-soft text-pos-warning";
                    const statusLabel =
                      order.status === "reconciled" ? "Reconciled" : "Pending";
                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedId(order.id)}
                        className="grid cursor-pointer grid-cols-[110px_1fr_90px_120px_120px_100px_40px] items-center gap-x-4 border-b border-pos-border-tertiary px-6 py-[11px] text-[13px] text-pos-text-primary hover:bg-pos-bg-secondary"
                      >
                        <div className="text-[12px] text-pos-text-secondary">
                          {displayId(order)}
                        </div>
                        <div>
                          <p className="font-medium text-pos-text-primary">
                            {order.customerName}
                          </p>
                          <p className="text-[12px] text-pos-text-secondary">
                            {fmtDate(order.createdAt)}
                          </p>
                        </div>
                        <div className="text-[12px] text-pos-text-secondary">
                          {order.weightGrams}g
                        </div>
                        <div>{fmtGHS(order.estimatedValue)}</div>
                        <div>{fmtGHS(order.amountPaid)}</div>
                        <div>
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                              statusStyle,
                            )}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className="text-center text-[16px] text-pos-text-tertiary">
                          <IconChevron className="inline-block size-4" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {selectedOrder && (
            <div className="rounded-[var(--radius-lg)] bg-black/30 p-4">
              <div className="ml-auto w-full rounded-(--radius-lg) border border-pos-border-tertiary bg-pos-bg-primary p-6 sm:w-80">
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-medium text-pos-text-primary">
                    {displayId(selectedOrder)}
                  </p>
                  <button
                    className="text-[18px] text-pos-text-secondary"
                    onClick={() => setSelectedId(null)}
                  >
                    x
                  </button>
                </div>
                <div className="mt-4 space-y-2 text-[13px]">
                  {[
                    ["Customer", selectedOrder.customerName],
                    ["Date", fmtDate(selectedOrder.createdAt)],
                    ["Notes", selectedOrder.notes ?? "—"],
                    ["Weight", selectedOrder.weightGrams + "g"],
                    ["Estimated value", fmtGHS(selectedOrder.estimatedValue)],
                    ["Amount paid", fmtGHS(selectedOrder.amountPaid)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-pos-border-tertiary pb-2 last:border-b-0"
                    >
                      <span className="text-pos-text-secondary">{label}</span>
                      <span className="font-medium text-pos-text-primary">
                        {value}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-b border-pos-border-tertiary pb-2">
                    <span className="text-pos-text-secondary">Status</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        selectedOrder.status === "reconciled"
                          ? "bg-pos-success-soft text-pos-success"
                          : "bg-pos-warning-soft text-pos-warning",
                      )}
                    >
                      {selectedOrder.status === "reconciled"
                        ? "Reconciled"
                        : "Pending"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => printOrderReceipt(selectedOrder)}
                  className="mt-4 h-8 w-full rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary text-[12px] font-medium text-pos-text-primary"
                >
                  Print receipt
                </Button>
              </div>
            </div>
          )}
        </div>
      </RequiresNetwork>
    </DashboardShell>
  );
}
