"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { IconExport, IconSearch } from "@/components/dashboard/icons";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, exportXlsx, fmtGHS } from "@/lib/utils";
import { useSessionContext } from "@/components/dashboard/session-guard";

type LedgerEntry = {
  id: string;
  customerId: string;
  customerName: string;
  orderId: string | null;
  orderNumber: string | null;
  type: "payout" | "credit" | "debit";
  amount: number;
  description: string | null;
  createdAt: string;
  orderCreatedByName: string | null;
  reconciledByName: string | null;
};

type LedgerStats = {
  totalCredits: number;
  totalDebits: number;
  customersWithCredit: number;
  customersWithDebit: number;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const filterButtons = [
  { id: "", label: "All" },
  { id: "credit", label: "Credits" },
  { id: "debit", label: "Arrears" },
  { id: "payout", label: "Payouts" },
];

// col layout: date | customer+order | type | amount | description | order by | reconciled by
const COLS = "grid-cols-[88px_minmax(160px,1.5fr)_76px_116px_minmax(140px,1fr)_110px_120px]";

const SkeletonRow = () => (
  <div className={cn("grid items-center gap-4 border-b border-pos-border-tertiary px-5 py-3", COLS)}>
    <span className="h-3.5 w-16 animate-pulse rounded bg-pos-bg-secondary" />
    <div className="space-y-1.5">
      <span className="block h-3.5 w-28 animate-pulse rounded bg-pos-bg-secondary" />
      <span className="block h-3 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    </div>
    <span className="h-5 w-14 animate-pulse rounded-full bg-pos-bg-secondary" />
    <span className="h-3.5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3.5 w-28 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3.5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3.5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
  </div>
);

export default function LedgerPage() {
  const { sidebarUser } = useSessionContext();
  const [typeFilter, setTypeFilter] = useState<"" | "payout" | "credit" | "debit">("");
  const [searchTerm, setSearchTerm] = useState("");

  const statsQuery = useQuery({
    queryKey: ["reports-stats"],
    queryFn: () =>
      fetch("/api/reports/stats").then(
        (r) => r.json() as Promise<{ ledger: LedgerStats }>,
      ),
  });
  const stats = statsQuery.data?.ledger ?? null;

  const entriesQuery = useQuery({
    queryKey: ["ledger", typeFilter],
    queryFn: () => {
      const url = typeFilter ? `/api/ledger?type=${typeFilter}` : `/api/ledger`;
      return fetch(url).then(
        (r) => r.json() as Promise<{ data: LedgerEntry[] }>,
      );
    },
  });
  const entries = entriesQuery.data?.data ?? [];

  const filteredEntries = entries.filter(
    (e) =>
      !searchTerm ||
      e.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.orderNumber ?? "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleExport = () => {
    exportXlsx(
      `ledger-${new Date().toISOString().slice(0, 10)}`,
      "Ledger",
      ["Date", "Customer", "Order #", "Type", "Amount (GHS)", "Description", "Order By", "Reconciled By"],
      filteredEntries.map((e) => [
        fmtDate(e.createdAt),
        e.customerName,
        e.orderNumber ?? (e.orderId ? `#${e.orderId.slice(0, 8).toUpperCase()}` : ""),
        e.type,
        e.amount,
        e.description,
        e.orderCreatedByName,
        e.reconciledByName,
      ]),
    )
  }

  const metrics = [
    {
      label: "Total credits issued",
      value: stats ? fmtGHS(stats.totalCredits) : "GHS —",
      valueClass: "text-pos-success",
    },
    {
      label: "Total arrears posted",
      value: stats ? fmtGHS(stats.totalDebits) : "GHS —",
      valueClass: "text-pos-danger",
    },
    {
      label: "Customers with credit",
      value: stats ? String(stats.customersWithCredit) : "—",
      valueClass: undefined,
    },
    {
      label: "Customers in arrears",
      value: stats ? String(stats.customersWithDebit) : "—",
      valueClass: undefined,
    },
  ];

  return (
    <DashboardShell activeItem="ledger" user={sidebarUser}>
      <Topbar
        title="Ledger"
        subtitle="All customer financial entries — immutable audit trail"
        actions={
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={filteredEntries.length === 0}
            className="h-8 gap-2 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-3 text-[12px] font-medium text-pos-text-secondary"
          >
            <IconExport className="size-3.5" />
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[var(--radius-md)] border border-pos-border-tertiary bg-pos-bg-primary px-4 py-3"
            >
              <p className="text-[11px] text-pos-text-secondary">{metric.label}</p>
              <p className={cn("mt-1 text-[18px] font-medium", metric.valueClass ?? "text-pos-text-primary")}>
                {statsQuery.isLoading ? (
                  <span className="inline-block h-5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
                ) : (
                  metric.value
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-pos-border-secondary bg-pos-bg-primary px-3">
            <IconSearch className="size-3.5 shrink-0 text-pos-text-tertiary" />
            <Input
              placeholder="Search by customer or order ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 border-0 bg-transparent px-0 text-[13px] text-pos-text-primary placeholder:text-pos-text-tertiary focus-visible:ring-0"
            />
          </div>
          {filterButtons.map((filter) => (
            <Button
              key={filter.id}
              variant="outline"
              onClick={() => setTypeFilter(filter.id as "" | "payout" | "credit" | "debit")}
              className={cn(
                "h-8 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-3 text-[12px] font-medium text-pos-text-secondary",
                typeFilter === filter.id && "border-pos-brand-mid bg-pos-brand-soft text-pos-brand-ink",
              )}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
          <div className="overflow-x-auto">
            {/* Header */}
            <div className={cn("grid min-w-205 gap-4 border-b border-pos-border-tertiary bg-pos-bg-secondary px-5 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-pos-text-tertiary", COLS)}>
              <span>Date</span>
              <span>Customer / Order</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Description</span>
              <span>Order by</span>
              <span>Reconciled by</span>
            </div>

            {/* Rows */}
            <div className="min-w-205">
              {entriesQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredEntries.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-pos-text-secondary">
                  No entries found.
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const typeBadge =
                    entry.type === "credit"
                      ? "bg-pos-success-soft text-pos-success"
                      : entry.type === "debit"
                        ? "bg-pos-danger-soft text-pos-danger"
                        : "bg-pos-info-soft text-pos-info";
                  const typeLabel =
                    entry.type === "credit" ? "Credit"
                      : entry.type === "debit" ? "Debit"
                        : "Payout";
                  const amountDisplay =
                    entry.amount > 0
                      ? "+ " + fmtGHS(entry.amount)
                      : "- " + fmtGHS(Math.abs(entry.amount));
                  const amountClass =
                    entry.type === "credit"
                      ? "text-pos-success"
                      : entry.type === "debit"
                        ? "text-pos-danger"
                        : "text-pos-text-primary";

                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "grid items-start gap-4 border-b border-pos-border-tertiary px-5 py-3 text-[13px] last:border-b-0 hover:bg-pos-bg-secondary",
                        COLS,
                      )}
                    >
                      {/* Date */}
                      <div className="pt-0.5 text-[12px] text-pos-text-secondary">
                        {fmtDate(entry.createdAt)}
                      </div>

                      {/* Customer / Order */}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-pos-text-primary">
                          {entry.customerName}
                        </p>
                        <p className="truncate text-[11px] text-pos-text-secondary">
                          {entry.orderNumber ?? (entry.orderId ? `#${entry.orderId.slice(0, 8).toUpperCase()}` : "—")}
                        </p>
                      </div>

                      {/* Type */}
                      <div className="pt-0.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", typeBadge)}>
                          {typeLabel}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className={cn("pt-0.5 font-medium tabular-nums", amountClass)}>
                        {amountDisplay}
                      </div>

                      {/* Description */}
                      <div className="pt-0.5 text-[12px] text-pos-text-secondary">
                        {entry.description ?? "—"}
                      </div>

                      {/* Order by */}
                      <div className="pt-0.5 text-[12px] text-pos-text-secondary">
                        {entry.orderCreatedByName ?? "—"}
                      </div>

                      {/* Reconciled by */}
                      <div className="pt-0.5 text-[12px] text-pos-text-secondary">
                        {entry.reconciledByName ?? "—"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
