"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { IconBack, IconSearch } from "@/components/dashboard/icons";
import { SectionLabel } from "@/components/dashboard/section-label";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-client";
import { cn, fmtGHS } from "@/lib/utils";
import { useSessionContext } from "@/components/dashboard/session-guard";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { localWrite, localGetAll, localGetById } from "@/services/sync/idb";
import { nanoid } from "nanoid";
import type { Customer, Order } from "@/lib/db/schemas";

const CACHED_RATE_KEY = "pos-cached-rate";
const DEFAULT_RATE = 380;

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const readCachedRate = () => {
  if (typeof window === "undefined") return DEFAULT_RATE;
  const cached = Number(localStorage.getItem(CACHED_RATE_KEY));
  return Number.isFinite(cached) && cached > 0 ? cached : DEFAULT_RATE;
};

const writeCachedRate = (rate: number) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHED_RATE_KEY, String(rate));
  } catch {}
};

function NewOrderInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sidebarUser, userId } = useSessionContext();
  const { isOnline } = useNetworkStatus();

  const navigateTo = (href: string) => {
    if (isOnline) {
      router.push(href);
      return;
    }
    window.location.assign(href);
  };

  // Customer selection
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    searchParams.get("customerId"),
  );
  const [showPicker, setShowPicker] = useState(!searchParams.get("customerId"));
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setDebouncedSearch(customerSearch),
      280,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [customerSearch]);

  // Order fields
  const [orderId] = useState(() => nanoid());
  const [weightGrams, setWeightGrams] = useState("");
  const [estimatedRate, setEstimatedRate] = useState("");
  const [rateUserEdited, setRateUserEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Queries
  const customerListQuery = useQuery({
    queryKey: ["customers-search", debouncedSearch],
    queryFn: async () => {
      const url = debouncedSearch
        ? `/api/customers?q=${encodeURIComponent(debouncedSearch)}`
        : "/api/customers";
      try {
        const res = await apiFetch(url);
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<{ data: Customer[] }>;
      } catch {
        // Offline fallback: read from IndexedDB and filter client-side.
        let customers = await localGetAll("customers");
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          customers = customers.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.phone.toLowerCase().includes(q),
          );
        }
        return { data: customers as Customer[] };
      }
    },
    enabled: showPicker,
  });

  const customerQuery = useQuery({
    queryKey: ["customer", selectedCustomerId],
    queryFn: async () => {
      try {
        const res = await apiFetch(`/api/customers/${selectedCustomerId}`);
        if (!res.ok) throw new Error(res.statusText);
        return res.json() as Promise<{
          customer: Customer;
          orderCount: number;
          totalPaid: number;
          recentOrders: Order[];
        }>;
      } catch {
        // Offline fallback: assemble the customer detail from IDB.
        const customer = await localGetById("customers", selectedCustomerId!);
        if (!customer) return null;
        const orders = await localGetAll("orders");
        const customerOrders = orders.filter(
          (o) => o.customerId === customer.id,
        );
        const totalPaid = customerOrders.reduce(
          (sum, o) => sum + o.amountPaid,
          0,
        );
        return {
          customer,
          orderCount: customerOrders.length,
          totalPaid,
          recentOrders: customerOrders
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 5),
        };
      }
    },
    enabled: !!selectedCustomerId,
  });
  const customer = customerQuery.data ?? null;

  const rateQuery = useQuery({
    queryKey: ["current-rate"],
    queryFn: async () => {
      try {
        const res = await apiFetch("/api/settings/rate");
        if (!res.ok) throw new Error(res.statusText);
        const data = (await res.json()) as { rate: number };
        writeCachedRate(data.rate);
        return data;
      } catch {
        return { rate: readCachedRate() };
      }
    },
  });

  useEffect(() => {
    if (rateQuery.data && !rateUserEdited) {
      setEstimatedRate(String(rateQuery.data.rate));
    }
  }, [rateQuery.data, rateUserEdited]);

  const weight = parseFloat(weightGrams) || 0;
  const rate = parseFloat(estimatedRate) || 0;
  const estimatedValue = weight * rate;
  const ledgerAdjustment = customer?.customer.ledgerBalance ?? 0;
  const amountPaid = estimatedValue + ledgerAdjustment;

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setShowPicker(false);
    setCustomerSearch("");
  };

  const handleSubmit = async () => {
    if (isSubmitting || submitted || !selectedCustomerId) return;
    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const newOrder = {
        id: orderId,
        customerId: selectedCustomerId,
        createdBy: userId,
        weightGrams: weight,
        estimatedRate: rate,
        estimatedValue,
        ledgerAdjustment,
        amountPaid,
        notes: notes.trim() || null,
        status: "pending" as const,
        createdAt: now,
        updatedAt: now,
      };
      await localWrite("orders", "insert", newOrder);
      setSubmitted(true);
      setTimeout(() => navigateTo(isOnline ? "/" : "/customers"), 1500);
    } catch {
      // silently fail
    } finally {
      setIsSubmitting(false);
    }
  };

  const customerList = customerListQuery.data?.data ?? [];

  return (
    <DashboardShell activeItem="new-order" user={sidebarUser}>
      <Topbar
        title="New order"
        leading={
          <button
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }
              navigateTo("/customers");
            }}
            className="flex size-7 items-center justify-center rounded-[var(--radius-md)] border border-pos-border-secondary bg-pos-bg-primary"
          >
            <IconBack className="size-3.5" />
          </button>
        }
        trailing={
          <span className="text-[12px] text-pos-text-tertiary">
            #{orderId.slice(0, 8).toUpperCase()}
          </span>
        }
      />

      <div className="grid flex-1 gap-5 p-5 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {/* ── Customer section ─────────────────────────────────────── */}
          <div>
            <SectionLabel>Customer</SectionLabel>
            <div className="mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary">
              {showPicker ? (
                /* Inline customer picker */
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 border-b border-pos-border-tertiary px-4 py-2">
                    <IconSearch className="size-3.5 shrink-0 text-pos-text-tertiary" />
                    <Input
                      autoFocus
                      placeholder="Search by name or phone…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="h-8 border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {customerListQuery.isLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 border-b border-pos-border-tertiary px-4 py-3"
                        >
                          <span className="size-8 animate-pulse rounded-full bg-pos-bg-secondary" />
                          <div className="flex-1 space-y-1.5">
                            <span className="block h-3.5 w-28 animate-pulse rounded bg-pos-bg-secondary" />
                            <span className="block h-3 w-20 animate-pulse rounded bg-pos-bg-secondary" />
                          </div>
                        </div>
                      ))
                    ) : customerList.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[13px] text-pos-text-secondary">
                        No customers found.
                      </p>
                    ) : (
                      customerList.map((c) => {
                        const bal = c.ledgerBalance ?? 0;
                        return (
                          <button
                            key={c.id}
                            onClick={() => handleSelectCustomer(c)}
                            className="flex w-full items-center gap-3 border-b border-pos-border-tertiary px-4 py-3 text-left last:border-b-0 hover:bg-pos-bg-secondary"
                          >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pos-brand-soft text-[11px] font-medium text-pos-brand-ink">
                              {initials(c.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-pos-text-primary">
                                {c.name}
                              </p>
                              <p className="text-[11px] text-pos-text-secondary">
                                {c.phone}
                              </p>
                            </div>
                            {bal !== 0 && (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  bal > 0
                                    ? "bg-pos-success-soft text-pos-success"
                                    : "bg-pos-danger-soft text-pos-danger",
                                )}
                              >
                                {bal > 0 ? "+" : "-"}GHS{" "}
                                {Math.abs(bal).toFixed(2)}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Selected customer card */
                <>
                  <div className="flex items-center gap-3 border-b border-pos-border-tertiary px-5 py-4">
                    <div className="flex size-10 items-center justify-center rounded-full bg-pos-brand-soft text-[13px] font-medium text-pos-brand-ink">
                      {customer ? initials(customer.customer.name) : "—"}
                    </div>
                    <div className="flex-1">
                      <p className="text-[14px] font-medium text-pos-text-primary">
                        {customerQuery.isLoading ? (
                          <span className="inline-block h-4 w-32 animate-pulse rounded bg-pos-bg-secondary" />
                        ) : (
                          customer?.customer.name
                        )}
                      </p>
                      <p className="text-[12px] text-pos-text-secondary">
                        {customerQuery.isLoading ? (
                          <span className="inline-block h-3 w-40 animate-pulse rounded bg-pos-bg-secondary" />
                        ) : customer ? (
                          `${customer.customer.phone} · ${customer.orderCount} order${customer.orderCount !== 1 ? "s" : ""}`
                        ) : null}
                      </p>
                    </div>
                    {customer && (
                      <span className="rounded-full bg-pos-brand-soft px-2 py-0.5 text-[11px] font-medium text-pos-brand-ink">
                        {customer.orderCount > 0 ? "Returning" : "New"}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setShowPicker(true);
                        setSelectedCustomerId(null);
                      }}
                      className="rounded-[var(--radius-md)] border border-pos-border-tertiary px-3 py-1 text-[12px] text-pos-text-secondary hover:bg-pos-bg-secondary"
                    >
                      Change
                    </button>
                  </div>
                  {ledgerAdjustment !== 0 && (
                    <div
                      className={`mx-5 my-3 flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-[12px] ${
                        ledgerAdjustment > 0
                          ? "bg-pos-success-soft text-pos-success"
                          : "bg-pos-danger-soft text-pos-danger"
                      }`}
                    >
                      <span>
                        {ledgerAdjustment > 0
                          ? "Credit from previous order"
                          : "Arrears from previous order"}
                      </span>
                      <span className="font-medium">
                        {ledgerAdjustment > 0 ? "+ " : "- "}GHS{" "}
                        {Math.abs(ledgerAdjustment).toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Gold details ─────────────────────────────────────────── */}
          <div>
            <SectionLabel>Gold details</SectionLabel>
            <div className="mt-2 rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-pos-text-secondary">
                    Weight (grams)
                  </label>
                  <Input
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(e.target.value)}
                    className="mt-1 h-9 rounded-[var(--radius-md)] border-pos-border-secondary text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-pos-text-secondary">
                    Rate (GHS / g)
                  </label>
                  <Input
                    value={estimatedRate}
                    onChange={(e) => {
                      setEstimatedRate(e.target.value);
                      setRateUserEdited(true);
                    }}
                    className="mt-1 h-9 rounded-[var(--radius-md)] border-pos-border-secondary text-[13px]"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="text-[12px] text-pos-text-secondary">
                  Notes (optional)
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Item description, any additional notes…"
                  className="mt-1 h-9 rounded-[var(--radius-md)] border-pos-border-secondary text-[13px]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div>
            <SectionLabel>Payout summary</SectionLabel>
            <div className="mt-2 rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary p-5">
              {!selectedCustomerId ? (
                <div className="rounded-[var(--radius-md)] bg-pos-warning-soft px-3 py-3 text-center text-[13px] text-pos-warning">
                  Select a customer above to continue
                </div>
              ) : (
                <>
                  <div className="rounded-[var(--radius-md)] bg-pos-bg-secondary p-4">
                    {[
                      ["Weight", `${weight.toFixed(2)} g`],
                      ["Rate", `${fmtGHS(rate)}/g`],
                      ["Estimated value", fmtGHS(estimatedValue)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex justify-between py-1 text-[13px]"
                      >
                        <span className="text-pos-text-secondary">{label}</span>
                        <span className="text-pos-text-primary">{value}</span>
                      </div>
                    ))}
                    {ledgerAdjustment !== 0 && (
                      <div className="flex justify-between py-1 text-[13px]">
                        <span className="text-pos-brand-dark">
                          {ledgerAdjustment > 0
                            ? "Credit applied"
                            : "Arrears deducted"}
                        </span>
                        <span
                          className={cn(
                            "font-medium",
                            ledgerAdjustment > 0
                              ? "text-pos-success"
                              : "text-pos-danger",
                          )}
                        >
                          {ledgerAdjustment > 0 ? "+ " : "- "}
                          {fmtGHS(Math.abs(ledgerAdjustment))}
                        </span>
                      </div>
                    )}
                    <div className="mt-3 flex justify-between border-t border-pos-border-tertiary pt-3 text-[15px] font-medium">
                      <span>Pay customer</span>
                      <span className="text-pos-brand-ink">
                        {fmtGHS(amountPaid)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[var(--radius-md)] bg-pos-bg-secondary px-3 py-2 text-[12px] text-pos-text-secondary">
                    Final value confirmed at reconciliation. Any difference
                    applied to customer ledger.
                  </div>

                  <div className="mt-4">
                    <Button
                      onClick={handleSubmit}
                      disabled={isSubmitting || submitted}
                      className="h-9 w-full rounded-[var(--radius-md)] bg-pos-brand text-[13px] font-medium text-white hover:bg-pos-brand-dark"
                    >
                      {submitted
                        ? "Order saved!"
                        : isSubmitting
                          ? "Saving..."
                          : "Confirm transaction"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary p-5">
            <SectionLabel>Customer history</SectionLabel>
            <div className="mt-3 space-y-2 text-[12px]">
              {!selectedCustomerId ? (
                <p className="text-pos-text-secondary">
                  Select a customer to view history.
                </p>
              ) : customerQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex justify-between border-b border-pos-border-tertiary pb-2"
                  >
                    <span className="h-3 w-28 animate-pulse rounded bg-pos-bg-secondary" />
                    <span className="h-3 w-16 animate-pulse rounded bg-pos-bg-secondary" />
                  </div>
                ))
              ) : (
                customer?.recentOrders.slice(0, 3).map((order) => (
                  <div
                    key={order.id}
                    className="flex justify-between border-b border-pos-border-tertiary pb-2 last:border-b-0"
                  >
                    <span className="text-pos-text-secondary">
                      {order.orderNumber ??
                        `#${order.id.slice(0, 6).toUpperCase()}`}{" "}
                      -{" "}
                      {order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString(
                            "en-GB",
                            {
                              day: "2-digit",
                              month: "short",
                            },
                          )
                        : ""}
                    </span>
                    <span className="text-pos-brand-dark">
                      {order.status === "pending" ? "Pending" : "Reconciled"}
                    </span>
                  </div>
                ))
              )}
            </div>
            {selectedCustomerId && (
              <Button
                variant="outline"
                onClick={() => navigateTo("/customers")}
                className="mt-3 h-8 w-full rounded-[var(--radius-md)] border-pos-border-tertiary text-[12px] text-pos-text-secondary"
              >
                View full history
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrderInner />
    </Suspense>
  );
}
