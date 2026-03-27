"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { IconCheck } from "@/components/dashboard/icons"
import { Topbar } from "@/components/dashboard/topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, fmtGHS } from "@/lib/utils"
import { useSessionContext } from "@/components/dashboard/session-guard"

type PendingOrder = {
  id: string
  orderNumber: string | null
  customerId: string
  weightGrams: number
  estimatedRate: number
  estimatedValue: number
  amountPaid: number
  notes: string | null
  createdAt: string
  customerName: string
  customerPhone: string
}

const displayId = (o: Pick<PendingOrder, "id" | "orderNumber">) =>
  o.orderNumber ?? `#${o.id.slice(0, 6).toUpperCase()}`

const SkeletonRow = () => (
  <div className="grid grid-cols-[90px_1fr_80px_90px_90px_110px_90px] items-center gap-0 border-b border-pos-border-tertiary px-4 py-3">
    <span className="inline-block h-3.5 w-14 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-3.5 w-28 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-3.5 w-10 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-3.5 w-16 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-8 w-20 animate-pulse rounded-[var(--radius-md)] bg-pos-bg-secondary" />
    <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="inline-block h-7 w-16 animate-pulse rounded-[var(--radius-md)] bg-pos-bg-secondary" />
  </div>
)

export default function ReconciliationPage() {
  const router = useRouter()
  const { sidebarUser } = useSessionContext()
  const [rates, setRates] = useState<Record<string, string>>({})
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState<string | null>(null)

  const ordersQuery = useQuery({
    queryKey: ["reconciliation-orders"],
    queryFn: () =>
      fetch("/api/reconciliation").then((r) => r.json() as Promise<{ data: PendingOrder[] }>),
  })
  const orders = ordersQuery.data?.data ?? []

  const pendingCount = orders.length - confirmedIds.size
  const totalEstimated = orders.reduce((s, o) => s + o.estimatedValue, 0)

  const confirmedOrders = orders.filter((o) => confirmedIds.has(o.id))
  const totalTrueValue = confirmedOrders.reduce((s, o) => {
    const rate = parseFloat(rates[o.id] ?? "0")
    return s + o.weightGrams * rate
  }, 0)
  const netLedgerImpact = confirmedOrders.reduce((s, o) => {
    const rate = parseFloat(rates[o.id] ?? "0")
    const trueValue = o.weightGrams * rate
    return s + (trueValue - o.estimatedValue)
  }, 0)

  const allConfirmed = orders.length > 0 && confirmedIds.size === orders.length

  async function handleConfirm(order: PendingOrder) {
    const rate = parseFloat(rates[order.id] ?? "")
    if (!rate || rate <= 0) return
    setSubmitting(order.id)
    try {
      const res = await fetch("/api/valuations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, trueRate: rate }),
      })
      if (res.ok) {
        setConfirmedIds((prev) => new Set([...prev, order.id]))
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(null)
    }
  }

  const summary = [
    { label: "Pending orders", value: String(pendingCount) },
    {
      label: "Total estimated",
      value:
        "GHS " +
        totalEstimated.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
    {
      label: "Total true value",
      value: confirmedIds.size > 0 ? fmtGHS(totalTrueValue) : "GHS —",
      valueClass: confirmedIds.size === 0 ? "text-pos-text-secondary" : undefined,
    },
    {
      label: "Net ledger impact",
      value:
        confirmedIds.size > 0
          ? (netLedgerImpact >= 0 ? "+ " : "- ") + fmtGHS(Math.abs(netLedgerImpact))
          : "—",
      valueClass: confirmedIds.size === 0 ? "text-pos-text-secondary" : undefined,
    },
  ]

  return (
    <DashboardShell activeItem="reconciliation" user={sidebarUser}>
      <Topbar
        title="Reconciliation"
        subtitle="Enter true assay values to reconcile pending orders"
        actions={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-pos-warning-soft px-3 py-1 text-[11px] font-medium text-pos-warning">
              {pendingCount} pending
            </span>
            <Button
              className="h-8 rounded-[var(--radius-md)] bg-pos-brand px-3 text-[12px] font-medium text-white"
              disabled={!allConfirmed}
              onClick={() => router.push("/ledger")}
            >
              Finalise all &amp; post to ledgers
            </Button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-pos-warning-mid bg-pos-warning-soft px-4 py-3 text-[12px] text-pos-warning">
          <span>
            This action is admin-only. All confirmed valuations will update customer ledger balances
            immediately.
          </span>
          <span className="font-medium">
            {confirmedIds.size} / {orders.length} confirmed
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {summary.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[var(--radius-md)] border border-pos-border-tertiary bg-pos-bg-primary px-4 py-3"
            >
              <p className="text-[11px] text-pos-text-secondary">{metric.label}</p>
              <p className={cn("mt-1 text-[18px] font-medium text-pos-text-primary", metric.valueClass)}>
                {ordersQuery.isLoading ? (
                  <span className="inline-block h-5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
                ) : (
                  metric.value
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
          <div className="grid grid-cols-[90px_1fr_80px_90px_90px_110px_90px] gap-0 border-b border-pos-border-tertiary bg-pos-bg-secondary px-4 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-pos-text-tertiary">
            <span>Order</span>
            <span>Customer</span>
            <span>Weight</span>
            <span>Est. value</span>
            <span>True rate</span>
            <span>True value / delta</span>
            <span>Action</span>
          </div>
          {ordersQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : orders.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-pos-text-secondary">
              No pending orders.
            </div>
          ) : (
            orders.map((order) => {
              const rateStr = rates[order.id] ?? ""
              const rate = parseFloat(rateStr)
              const hasRate = !isNaN(rate) && rate > 0
              const trueValue = hasRate ? order.weightGrams * rate : 0
              const delta = hasRate ? trueValue - order.estimatedValue : 0
              const isConfirmed = confirmedIds.has(order.id)
              const isSubmittingThis = submitting === order.id

              return (
                <div
                  key={order.id}
                  className="grid grid-cols-[90px_1fr_80px_90px_90px_110px_90px] items-center gap-0 border-b border-pos-border-tertiary px-4 py-3 text-[13px] text-pos-text-primary hover:bg-pos-bg-secondary"
                >
                  <div className="text-[12px] text-pos-text-secondary">{displayId(order)}</div>
                  <div className="font-medium">{order.customerName}</div>
                  <div className="text-[12px] text-pos-text-secondary">{order.weightGrams}g</div>
                  <div>{fmtGHS(order.estimatedValue)}</div>
                  <div>
                    <Input
                      placeholder="0.00"
                      value={rateStr}
                      disabled={isConfirmed}
                      onChange={(e) => setRates((r) => ({ ...r, [order.id]: e.target.value }))}
                      className="h-8 w-20 rounded-[var(--radius-md)] border-pos-border-secondary bg-pos-bg-primary px-2 text-[12px]"
                    />
                  </div>
                  <div className="text-[12px]">
                    {isConfirmed ? (
                      <span className="text-pos-success">
                        {fmtGHS(trueValue)}
                        <br />
                        <span className={delta >= 0 ? "text-pos-success" : "text-pos-danger"}>
                          {delta >= 0
                            ? "+ GHS " + delta.toFixed(2)
                            : "- GHS " + Math.abs(delta).toFixed(2)}
                        </span>
                      </span>
                    ) : hasRate ? (
                      <span>
                        {fmtGHS(trueValue)}
                        <br />
                        <span className={delta >= 0 ? "text-pos-success" : "text-pos-danger"}>
                          {delta >= 0
                            ? "+ GHS " + delta.toFixed(2)
                            : "- GHS " + Math.abs(delta).toFixed(2)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-pos-text-tertiary">—</span>
                    )}
                  </div>
                  <div>
                    {isConfirmed ? (
                      <span className="flex items-center gap-1 text-[12px] font-medium text-pos-success">
                        <IconCheck className="size-3.5" />
                        Done
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        className="h-7 rounded-[var(--radius-md)] border-pos-brand-mid bg-pos-brand-soft px-2 text-[12px] font-medium text-pos-brand-ink"
                        disabled={!hasRate || isSubmittingThis}
                        onClick={() => handleConfirm(order)}
                      >
                        {isSubmittingThis ? "…" : "Confirm"}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div
          className={cn(
            "rounded-lg border border-pos-success-mid bg-pos-success-soft px-6 py-5 text-center",
            !allConfirmed && "hidden"
          )}
        >
          <div className="flex items-center justify-center gap-2 text-pos-success">
            <IconCheck className="size-4" />
            <span className="text-[15px] font-medium">Reconciliation complete</span>
          </div>
          <p className="mt-2 text-[13px] text-pos-success-ink">
            All {orders.length} customer ledgers have been updated. Credits and arrears will apply on
            next orders.
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              className="h-7 rounded-md px-3 text-[12px]"
              onClick={() => router.push("/reports")}
            >
              View report
            </Button>
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
