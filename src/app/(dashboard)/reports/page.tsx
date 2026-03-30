"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { IconExport } from "@/components/dashboard/icons"
import { Topbar } from "@/components/dashboard/topbar"
import { Button } from "@/components/ui/button"
import { cn, exportXlsx, fmtGHS } from "@/lib/utils"
import { useSessionContext } from "@/components/dashboard/session-guard"
import { RequiresNetwork } from "@/components/dashboard/requires-network"

type ReportsStats = {
  weeklyOrders: {
    total: number
    totalPaid: number
    avgOrder: number
    pending: number
  }
  ledger: {
    totalCredits: number
    totalDebits: number
    customersWithCredit: number
    customersWithDebit: number
  }
}

type ChartData = {
  weeklyPayouts: { week: string; totalPaid: number; orderCount: number }[]
  topCustomers: { customerId: string; name: string; totalPaid: number }[]
  reconciliation: {
    total: number
    avgDelta: number
    underpaidCount: number
    overpaidCount: number
    exactCount: number
    avgErrorRate: number
  }
}

const periodLabels = ["This week", "This month", "All time"]

export default function ReportsPage() {
  const { sidebarUser } = useSessionContext()
  const [activePeriod, setActivePeriod] = useState(0)

  const statsQuery = useQuery({
    queryKey: ["reports-stats"],
    queryFn: () => fetch("/api/reports/stats").then((r) => r.json() as Promise<ReportsStats>),
  })

  const chartsQuery = useQuery({
    queryKey: ["reports-charts"],
    queryFn: () => fetch("/api/reports/charts").then((r) => r.json() as Promise<ChartData>),
  })

  const stats = statsQuery.data ?? null
  const chartData = chartsQuery.data ?? null
  const isLoading = statsQuery.isLoading || chartsQuery.isLoading

  const handleExport = () => {
    if (!chartData) return
    exportXlsx(
      `report-top-customers-${new Date().toISOString().slice(0, 10)}`,
      "Top Customers",
      ["Customer", "Total Paid (GHS)"],
      chartData.topCustomers.map((c) => [c.name, c.totalPaid]),
    )
  }

  const metrics = [
    {
      label: "Total orders",
      value: stats ? String(stats.weeklyOrders.total) : "—",
      sub: "gold purchases",
    },
    {
      label: "Total paid out",
      value: stats ? fmtGHS(stats.weeklyOrders.totalPaid) : "GHS —",
      sub: "to customers",
    },
    {
      label: "Avg. order value",
      value: stats ? fmtGHS(stats.weeklyOrders.avgOrder) : "GHS —",
      sub: "per transaction",
    },
    {
      label: "Active customers",
      value: stats
        ? String(stats.ledger.customersWithCredit + stats.ledger.customersWithDebit)
        : "—",
      sub: "unique this period",
    },
  ]

  return (
    <DashboardShell activeItem="reports" user={sidebarUser}>
      <RequiresNetwork>
      <Topbar
        title="Reports"
        subtitle="Business overview - March 2026"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {periodLabels.map((label, index) => (
              <Button
                key={label}
                variant="outline"
                onClick={() => setActivePeriod(index)}
                className={cn(
                  "h-7 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-3 text-[12px] font-medium text-pos-text-secondary",
                  activePeriod === index && "border-pos-brand-mid bg-pos-brand-soft text-pos-brand-ink"
                )}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!chartData || chartData.topCustomers.length === 0}
              className="h-7 gap-2 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-3 text-[12px] font-medium text-pos-text-secondary"
            >
              <IconExport className="size-3" />
              Export
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[var(--radius-md)] border border-pos-border-tertiary bg-pos-bg-primary px-4 py-3"
            >
              <p className="text-[11px] text-pos-text-secondary">{metric.label}</p>
              <p className="text-[20px] font-medium text-pos-text-primary">
                {statsQuery.isLoading ? (
                  <span className="inline-block h-6 w-20 animate-pulse rounded bg-pos-bg-secondary" />
                ) : (
                  metric.value
                )}
              </p>
              <p className="text-[11px] text-pos-text-tertiary">{metric.sub}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
          <div className="flex items-center justify-between border-b border-pos-border-tertiary px-5 py-3">
            <p className="text-[13px] font-medium text-pos-text-primary">Payouts by week</p>
            <span className="text-[11px] text-pos-text-tertiary">GHS</span>
          </div>
          <div className="px-5 py-4">
            {chartsQuery.isLoading ? (
              <div className="flex h-[120px] items-end gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="inline-block h-3 w-8 animate-pulse rounded bg-pos-bg-secondary" />
                    <span
                      className="w-full animate-pulse rounded-[4px] bg-pos-bg-secondary"
                      style={{ height: `${40 + (i % 3) * 25}px` }}
                    />
                  </div>
                ))}
              </div>
            ) : chartData && chartData.weeklyPayouts.length > 0 ? (
              (() => {
                const maxVal = Math.max(...chartData.weeklyPayouts.map((w) => w.totalPaid))
                return (
                  <>
                    <div className="flex h-[120px] items-end gap-2">
                      {chartData.weeklyPayouts.map((item) => (
                        <div key={item.week} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] text-pos-text-secondary">
                            GHS {(item.totalPaid / 1000).toFixed(0)}k
                          </span>
                          <div
                            className="w-full rounded-[4px] bg-pos-brand"
                            style={{ height: `${Math.round((item.totalPaid / maxVal) * 90)}px` }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between">
                      {chartData.weeklyPayouts.map((item) => (
                        <span key={item.week} className="text-[10px] text-pos-text-tertiary">
                          {item.week}
                        </span>
                      ))}
                    </div>
                  </>
                )
              })()
            ) : (
              <div className="flex h-[120px] items-center justify-center text-[13px] text-pos-text-tertiary">
                No data yet
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
            <div className="flex items-center justify-between border-b border-pos-border-tertiary px-5 py-3">
              <p className="text-[13px] font-medium text-pos-text-primary">Top customers</p>
              <span className="text-[11px] text-pos-text-tertiary">by total payout</span>
            </div>
            <div className="px-5 py-4">
              {chartsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="h-3 w-14 animate-pulse rounded bg-pos-bg-secondary" />
                      <span className="h-5 flex-1 animate-pulse rounded-[4px] bg-pos-bg-secondary" />
                      <span className="h-3 w-16 animate-pulse rounded bg-pos-bg-secondary" />
                    </div>
                  ))}
                </div>
              ) : chartData && chartData.topCustomers.length > 0 ? (
                (() => {
                  const maxVal = chartData.topCustomers[0].totalPaid
                  return (
                    <div className="space-y-3">
                      {chartData.topCustomers.map((customer) => (
                        <div key={customer.customerId} className="flex items-center gap-3 text-[12px]">
                          <span className="w-14 truncate text-right text-pos-text-secondary">
                            {customer.name.split(" ")[0]}
                          </span>
                          <div className="h-5 flex-1 overflow-hidden rounded-[4px] bg-pos-bg-secondary">
                            <div
                              className="h-full rounded-[4px] bg-pos-brand"
                              style={{
                                width: `${Math.round((customer.totalPaid / maxVal) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="w-16 text-right font-medium text-pos-text-primary">
                            GHS {(customer.totalPaid / 1000).toFixed(1)}k
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })()
              ) : (
                <div className="flex h-20 items-center justify-center text-[13px] text-pos-text-tertiary">
                  No data yet
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
            <div className="flex items-center justify-between border-b border-pos-border-tertiary px-5 py-3">
              <p className="text-[13px] font-medium text-pos-text-primary">Reconciliation accuracy</p>
              <span className="text-[11px] text-pos-text-tertiary">estimate vs true value</span>
            </div>
            <div className="px-5 py-4">
              {chartsQuery.isLoading ? (
                <div className="space-y-4">
                  <div>
                    <span className="block h-3 w-32 animate-pulse rounded bg-pos-bg-secondary" />
                    <span className="mt-2 block h-2 w-full animate-pulse rounded-full bg-pos-bg-secondary" />
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex justify-between border-b border-pos-border-tertiary py-2">
                      <span className="h-3 w-36 animate-pulse rounded bg-pos-bg-secondary" />
                      <span className="h-3 w-16 animate-pulse rounded bg-pos-bg-secondary" />
                    </div>
                  ))}
                </div>
              ) : chartData && chartData.reconciliation.total > 0 ? (
                (() => {
                  const r = chartData.reconciliation
                  const total = r.total
                  const accuracyPct =
                    total > 0 ? Math.max(0, Math.round((1 - r.avgErrorRate) * 100 * 10) / 10) : 0
                  const underpaidPct = total > 0 ? Math.round((r.underpaidCount / total) * 100) : 0
                  const overpaidPct = total > 0 ? Math.round((r.overpaidCount / total) * 100) : 0
                  const exactPct = total > 0 ? Math.round((r.exactCount / total) * 100) : 0
                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-[13px]">
                          <span className="text-pos-text-secondary">Estimation accuracy</span>
                          <span className="font-medium text-pos-success">{accuracyPct}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-pos-bg-secondary">
                          <div
                            className="h-full rounded-full bg-pos-brand"
                            style={{ width: `${accuracyPct}%` }}
                          />
                        </div>
                      </div>
                      {[
                        { label: "Avg. delta per order", value: fmtGHS(r.avgDelta) },
                        {
                          label: "Orders underpaid (credit)",
                          value: `${underpaidPct}%`,
                          valueClass: "text-pos-success",
                        },
                        {
                          label: "Orders overpaid (arrears)",
                          value: `${overpaidPct}%`,
                          valueClass: "text-pos-danger",
                        },
                        { label: "Exact match", value: `${exactPct}%` },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className="flex justify-between border-b border-pos-border-tertiary py-2 text-[13px] last:border-b-0"
                        >
                          <span className="text-pos-text-secondary">{row.label}</span>
                          <span className={cn("font-medium text-pos-text-primary", row.valueClass)}>
                            {row.value}
                          </span>
                        </div>
                      ))}
                      {underpaidPct > 60 && (
                        <div className="rounded-[var(--radius-md)] bg-pos-warning-soft px-3 py-2 text-[12px] text-pos-warning">
                          Tip: consistently underpaying suggests estimated rate is set too low. Consider
                          revising the default rate.
                        </div>
                      )}
                    </div>
                  )
                })()
              ) : (
                <div className="flex h-20 items-center justify-center text-[13px] text-pos-text-tertiary">
                  No reconciled orders yet
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </RequiresNetwork>
    </DashboardShell>
  )
}
