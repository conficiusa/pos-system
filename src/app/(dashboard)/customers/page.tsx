"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { IconSearch } from "@/components/dashboard/icons"
import { Topbar } from "@/components/dashboard/topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, fmtGHS } from "@/lib/utils"
import { useSessionContext } from "@/components/dashboard/session-guard"
import { localWrite, flushSyncQueue } from "@/services/sync/idb"
import { nanoid } from "nanoid"
import type { Customer, Order } from "@/lib/db/schemas"

type CustomerListItem = Customer & { orderCount?: number }

const colorPalette = [
  { bg: "var(--pos-brand-soft)", text: "var(--pos-brand-ink)" },
  { bg: "var(--pos-purple-soft)", text: "var(--pos-purple)" },
  { bg: "var(--pos-warning-soft)", text: "var(--pos-warning)" },
  { bg: "var(--pos-orange-soft)", text: "var(--pos-orange)" },
  { bg: "var(--pos-info-soft)", text: "var(--pos-info)" },
]

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

const SkeletonCustomerRow = () => (
  <div className="flex items-center gap-3 border-b border-pos-border-tertiary px-4 py-3">
    <span className="size-9 animate-pulse rounded-full bg-pos-bg-secondary" />
    <div className="flex-1 space-y-1.5">
      <span className="block h-3.5 w-32 animate-pulse rounded bg-pos-bg-secondary" />
      <span className="block h-3 w-24 animate-pulse rounded bg-pos-bg-secondary" />
    </div>
    <span className="h-5 w-16 animate-pulse rounded-full bg-pos-bg-secondary" />
  </div>
)

export default function CustomersPage() {
  const router = useRouter()
  const { sidebarUser, userId } = useSessionContext()
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Settlement state
  const [settlementAmount, setSettlementAmount] = useState("")
  const [settlementNote, setSettlementNote] = useState("")
  const [isSettling, setIsSettling] = useState(false)
  const [settlementError, setSettlementError] = useState<string | null>(null)
  const [settlementSuccess, setSettlementSuccess] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery])

  const customersQuery = useQuery({
    queryKey: ["customers", debouncedQuery],
    queryFn: () => {
      const url = debouncedQuery
        ? `/api/customers?q=${encodeURIComponent(debouncedQuery)}`
        : "/api/customers"
      return fetch(url).then((r) => r.json() as Promise<{ data?: CustomerListItem[] }>)
    },
  })
  const customers = customersQuery.data?.data ?? []

  const detailQuery = useQuery({
    queryKey: ["customer", selectedId],
    queryFn: () =>
      fetch(`/api/customers/${selectedId}`).then(
        (r) =>
          r.json() as Promise<{
            customer: Customer
            orderCount: number
            totalPaid: number
            recentOrders: Order[]
          }>,
      ),
    enabled: !!selectedId,
  })
  const detail = detailQuery.data ?? null

  const handleSettle = async (e: React.FormEvent, balance: number) => {
    e.preventDefault()
    setSettlementError(null)
    setSettlementSuccess(null)
    const amount = parseFloat(settlementAmount)
    if (isNaN(amount) || amount <= 0) {
      setSettlementError("Enter a valid amount")
      return
    }
    if (amount > Math.abs(balance)) {
      setSettlementError(`Cannot exceed outstanding balance of ${fmtGHS(Math.abs(balance))}`)
      return
    }
    setIsSettling(true)
    try {
      const res = await fetch(`/api/customers/${selectedId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: settlementNote || undefined }),
      })
      const data = await res.json() as { settled?: number; remainingBalance?: number; error?: string }
      if (!res.ok) {
        setSettlementError(data.error ?? "Failed to record settlement")
        return
      }
      const remaining = data.remainingBalance ?? 0
      setSettlementSuccess(
        remaining === 0
          ? "Balance fully settled."
          : `${fmtGHS(data.settled ?? 0)} recorded. Remaining: ${fmtGHS(Math.abs(remaining))}`
      )
      setSettlementAmount("")
      setSettlementNote("")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer", selectedId] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["ledger"] }),
      ])
    } catch {
      setSettlementError("Something went wrong")
    } finally {
      setIsSettling(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setIsCreating(true)
    setCreateError(null)
    try {
      const now = new Date().toISOString()
      const newCustomer = await localWrite("customers", "insert", {
        id: nanoid(),
        name: newName.trim(),
        phone: newPhone.trim(),
        ledgerBalance: 0,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      await flushSyncQueue().catch(() => {})
      setShowNewForm(false)
      setNewName("")
      setNewPhone("")
      await queryClient.invalidateQueries({ queryKey: ["customers"] })
      setSelectedId(newCustomer.id)
    } catch (err) {
      const isConstraint = err instanceof DOMException && err.name === "ConstraintError"
      setCreateError(isConstraint ? "A customer with this phone number already exists." : "Failed to create customer. Please try again.")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <DashboardShell activeItem="customers" user={sidebarUser}>
      <Topbar
        title="Customers"
        actions={
          <Button
            className="h-8 rounded-md bg-pos-brand px-3 text-[12px] font-medium text-white hover:bg-pos-brand-dark"
            onClick={() => setShowNewForm(true)}
          >
            + New customer
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-pos-border-secondary bg-pos-bg-primary px-3">
              <IconSearch className="size-3.5 text-pos-text-tertiary" />
              <Input
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 border-0 bg-transparent px-0 text-[13px] text-pos-text-primary placeholder:text-pos-text-tertiary focus-visible:ring-0"
              />
            </div>

            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
              {customersQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonCustomerRow key={i} />)
              ) : customers.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-pos-text-secondary">
                  No customers found.
                </div>
              ) : (
                customers.map((customer, index) => {
                  const palette = colorPalette[index % colorPalette.length]
                  const isSelected = customer.id === selectedId
                  const balance = customer.ledgerBalance ?? 0
                  return (
                    <div
                      key={customer.id}
                      onClick={() => setSelectedId(customer.id)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border-b border-pos-border-tertiary px-4 py-3 text-[13px]",
                        isSelected ? "bg-pos-brand-soft" : "hover:bg-pos-bg-secondary"
                      )}
                    >
                      <div
                        className="flex size-9 items-center justify-center rounded-full text-[12px] font-medium"
                        style={{ background: palette.bg, color: palette.text }}
                      >
                        {initials(customer.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-pos-text-primary">{customer.name}</p>
                        <p className="text-[12px] text-pos-text-secondary">
                          {customer.phone} - {customer.orderCount ?? 0} order
                          {(customer.orderCount ?? 0) !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        {balance > 0 ? (
                          <span className="rounded-full bg-pos-success-soft px-2 py-0.5 text-[11px] font-medium text-pos-success">
                            +{fmtGHS(balance)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="rounded-full bg-pos-danger-soft px-2 py-0.5 text-[11px] font-medium text-pos-danger">
                            -{fmtGHS(Math.abs(balance))}
                          </span>
                        ) : (
                          <span className="rounded-full bg-pos-bg-secondary px-2 py-0.5 text-[11px] font-medium text-pos-text-secondary">
                            Balanced
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {selectedId && (
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
                {detailQuery.isLoading ? (
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="size-10 animate-pulse rounded-full bg-pos-bg-secondary" />
                      <div className="space-y-1.5">
                        <span className="block h-4 w-32 animate-pulse rounded bg-pos-bg-secondary" />
                        <span className="block h-3 w-24 animate-pulse rounded bg-pos-bg-secondary" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <span key={i} className="block h-12 animate-pulse rounded-md bg-pos-bg-secondary" />
                      ))}
                    </div>
                  </div>
                ) : detail ? (
                  <>
                    <div className="flex items-center justify-between border-b border-pos-border-tertiary px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-pos-brand-soft text-[14px] font-medium text-pos-brand-ink">
                          {initials(detail.customer.name)}
                        </div>
                        <div>
                          <p className="text-[14px] font-medium text-pos-text-primary">{detail.customer.name}</p>
                          <p className="text-[12px] text-pos-text-secondary">{detail.customer.phone}</p>
                        </div>
                      </div>
                      <Button
                        className="h-7 rounded-md bg-pos-brand px-3 text-[12px] font-medium text-white hover:bg-pos-brand-dark"
                        onClick={() => router.push(`/new-order?customerId=${selectedId}`)}
                      >
                        New order
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-b border-pos-border-tertiary px-5 py-4">
                      <div className="rounded-md bg-pos-bg-secondary px-3 py-2">
                        <p className="text-[11px] text-pos-text-secondary">Total orders</p>
                        <p className="text-[16px] font-medium text-pos-text-primary">{detail.orderCount}</p>
                      </div>
                      <div className="rounded-md bg-pos-bg-secondary px-3 py-2">
                        <p className="text-[11px] text-pos-text-secondary">Total paid out</p>
                        <p className="text-[16px] font-medium text-pos-text-primary">
                          {fmtGHS(detail.totalPaid)}
                        </p>
                      </div>
                      <div className="rounded-md bg-pos-bg-secondary px-3 py-2">
                        <p className="text-[11px] text-pos-text-secondary">Ledger balance</p>
                        <p
                          className={cn(
                            "text-[16px] font-medium",
                            detail.customer.ledgerBalance > 0 && "text-pos-success",
                            detail.customer.ledgerBalance < 0 && "text-pos-danger",
                            detail.customer.ledgerBalance === 0 && "text-pos-text-primary"
                          )}
                        >
                          {detail.customer.ledgerBalance > 0
                            ? `+${fmtGHS(detail.customer.ledgerBalance)}`
                            : detail.customer.ledgerBalance < 0
                            ? `-${fmtGHS(Math.abs(detail.customer.ledgerBalance))}`
                            : fmtGHS(0)}
                        </p>
                      </div>
                    </div>
                    <div className="border-b border-pos-border-tertiary px-5 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-pos-text-tertiary">
                        Recent orders
                      </p>
                    </div>
                    <div>
                      {detail.recentOrders?.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 border-b border-pos-border-tertiary px-5 py-3 text-[12px] last:border-b-0"
                        >
                          <div
                            className={cn(
                              "mt-1 size-2 rounded-full",
                              item.status === "pending" ? "bg-pos-warning-amber" : "bg-pos-brand"
                            )}
                          />
                          <div className="flex-1">
                            <p className="font-medium text-pos-text-primary">
                              {item.orderNumber ?? `#${item.id.slice(0, 6).toUpperCase()}`}
                            </p>
                            <p className="text-pos-text-secondary">
                              {item.createdAt
                                ? new Date(item.createdAt).toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : ""}{" "}
                              - {item.weightGrams}g - {fmtGHS(item.estimatedValue ?? 0)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={item.status === "pending" ? "text-pos-warning" : "text-pos-brand-dark"}>
                              {item.status === "pending" ? "Pending" : "Reconciled"}
                            </p>
                            {item.ledgerAdjustment && item.ledgerAdjustment !== 0 ? (
                              <p className={item.ledgerAdjustment > 0 ? "text-pos-success" : "text-pos-danger"}>
                                {item.ledgerAdjustment > 0 ? "+" : "-"}{fmtGHS(Math.abs(item.ledgerAdjustment))}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Manual settlement — only shown when there is an outstanding balance */}
                    {(detail.customer.ledgerBalance ?? 0) !== 0 && (
                      <div className="border-t border-pos-border-tertiary px-5 py-4">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-pos-text-tertiary">
                          {(detail.customer.ledgerBalance ?? 0) < 0 ? "Receive arrears payment" : "Pay out credit"}
                        </p>
                        <p className="mt-1 text-[12px] text-pos-text-secondary">
                          {(detail.customer.ledgerBalance ?? 0) < 0
                            ? `Customer owes ${fmtGHS(Math.abs(detail.customer.ledgerBalance ?? 0))} — record cash received.`
                            : `Business owes customer ${fmtGHS(detail.customer.ledgerBalance ?? 0)} — record cash paid out.`}
                        </p>
                        <form
                          onSubmit={(e) => handleSettle(e, detail.customer.ledgerBalance ?? 0)}
                          className="mt-3 flex flex-col gap-2"
                        >
                          <div className="flex gap-2">
                            <div className="flex flex-1 items-center rounded-md border border-pos-border-secondary bg-pos-bg-primary">
                              <span className="px-2 text-[12px] text-pos-text-tertiary">GHS</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={Math.abs(detail.customer.ledgerBalance ?? 0)}
                                value={settlementAmount}
                                onChange={(e) => { setSettlementAmount(e.target.value); setSettlementError(null); setSettlementSuccess(null) }}
                                placeholder={Math.abs(detail.customer.ledgerBalance ?? 0).toFixed(2)}
                                className="h-8 flex-1 border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
                              />
                            </div>
                            <Button
                              type="submit"
                              disabled={isSettling || !settlementAmount}
                              className="h-8 rounded-md bg-pos-brand px-3 text-[12px] font-medium text-white hover:bg-pos-brand-dark"
                            >
                              {isSettling ? "Saving…" : "Record"}
                            </Button>
                          </div>
                          <Input
                            value={settlementNote}
                            onChange={(e) => setSettlementNote(e.target.value)}
                            placeholder="Note (optional)"
                            className="h-8 rounded-md border-pos-border-secondary text-[12px]"
                          />
                          {settlementError && (
                            <p className="text-[12px] text-pos-danger">{settlementError}</p>
                          )}
                          {settlementSuccess && (
                            <p className="text-[12px] text-pos-success">{settlementSuccess}</p>
                          )}
                        </form>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => { setShowNewForm(false); setCreateError(null) }}
        >
          <div
            className="w-full max-w-sm rounded-[var(--radius-lg)] bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-[15px] font-medium text-pos-text-primary">New customer</h2>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div>
                <label className="text-[12px] text-pos-text-secondary">Name</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="mt-1 h-9 rounded-md border-pos-border-secondary text-[13px]"
                  required
                />
              </div>
              <div>
                <label className="text-[12px] text-pos-text-secondary">Phone</label>
                <Input
                  value={newPhone}
                  onChange={(e) => { setNewPhone(e.target.value); setCreateError(null) }}
                  placeholder="e.g. 0244 123 456"
                  className="mt-1 h-9 rounded-md border-pos-border-secondary text-[13px]"
                />
              </div>
              {createError && (
                <p className="text-[12px] text-pos-danger">{createError}</p>
              )}
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 flex-1 rounded-md border-pos-border-secondary text-[13px]"
                  onClick={() => {
                    setShowNewForm(false)
                    setNewName("")
                    setNewPhone("")
                    setCreateError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating}
                  className="h-9 flex-1 rounded-md bg-pos-brand text-[13px] font-medium text-white hover:bg-pos-brand-dark"
                >
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
