"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { IconCheck } from "@/components/dashboard/icons";
import { Topbar } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-client";
import { cn, fmtGHS } from "@/lib/utils";
import { useSessionContext } from "@/components/dashboard/session-guard";
import { RequiresNetwork } from "@/components/dashboard/requires-network";

type PendingOrder = {
  id: string;
  orderNumber: string | null;
  customerId: string;
  weightGrams: number;
  estimatedRate: number;
  estimatedValue: number;
  amountPaid: number;
  notes: string | null;
  createdAt: string;
  customerName: string;
  customerPhone: string;
};

type ReconcileMode = "weight" | "value";

const displayId = (o: Pick<PendingOrder, "id" | "orderNumber">) =>
  o.orderNumber ?? `#${o.id.slice(0, 6).toUpperCase()}`;

const RECONCILIATION_TABLE_COLUMNS =
  "grid-cols-[minmax(110px,1.1fr)_minmax(180px,1.9fr)_minmax(80px,0.9fr)_minmax(120px,1fr)_minmax(120px,1fr)]";

const SkeletonRow = () => (
  <div
    className={cn(
      "grid items-center gap-x-4 border-b border-pos-border-tertiary px-6 py-3.5",
      RECONCILIATION_TABLE_COLUMNS,
    )}
  >
    <span className="h-3.5 w-14 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3.5 w-32 animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3 w-10 justify-self-end animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3 w-20 justify-self-end animate-pulse rounded bg-pos-bg-secondary" />
    <span className="h-3 w-16 animate-pulse rounded bg-pos-bg-secondary" />
  </div>
);

// ─── Drawer content ────────────────────────────────────────────────────────────

function ReconcileDrawer({
  order,
  open,
  onClose,
  onConfirmed,
}: {
  order: PendingOrder | null;
  open: boolean;
  onClose: () => void;
  onConfirmed: (orderId: string, trueRate: number) => Promise<void>;
}) {
  const [mode, setMode] = useState<ReconcileMode>("weight");
  const [correctedWeight, setCorrectedWeight] = useState("");
  const [rate, setRate] = useState("");
  const [finalValue, setFinalValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill fields whenever the drawer opens with a new order
  useEffect(() => {
    if (open && order) {
      setMode("weight");
      setCorrectedWeight(String(order.weightGrams));
      setRate(String(order.estimatedRate));
      setFinalValue("");
      setError(null);
    }
  }, [open, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onClose();
    }
  };

  if (!order) return <Sheet open={false} />;

  const parsedWeight = parseFloat(correctedWeight);
  const parsedRate = parseFloat(rate);
  const parsedValue = parseFloat(finalValue);

  const weightModeValid =
    !isNaN(parsedWeight) &&
    parsedWeight > 0 &&
    !isNaN(parsedRate) &&
    parsedRate > 0;
  const valueModeValid = !isNaN(parsedValue) && parsedValue > 0;
  const isValid = mode === "weight" ? weightModeValid : valueModeValid;

  let trueRate = 0;
  let trueValue = 0;
  if (mode === "weight" && weightModeValid) {
    trueValue = parsedWeight * parsedRate;
    trueRate = trueValue / order.weightGrams;
  } else if (mode === "value" && valueModeValid) {
    trueValue = parsedValue;
    trueRate = parsedValue / order.weightGrams;
  }
  const delta = isValid ? trueValue - order.estimatedValue : null;

  const handleConfirm = async () => {
    if (!isValid || trueRate <= 0) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirmed(order.id, trueRate);
      handleOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reconcile");
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 bg-pos-bg-primary p-0 text-pos-text-primary sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="border-b border-pos-border-tertiary px-5 py-4">
          <SheetTitle className="text-[15px] font-medium text-pos-text-primary">
            Reconcile order
          </SheetTitle>
          <SheetDescription className="text-[12px] text-pos-text-secondary">
            {order.customerName} · {displayId(order)}
          </SheetDescription>
        </SheetHeader>

        {/* Order snapshot */}
        <div className="border-b border-pos-border-tertiary bg-pos-bg-secondary px-5 py-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-pos-text-tertiary">
            Order details
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <span className="text-pos-text-secondary">Recorded weight</span>
            <span className="text-right font-medium">{order.weightGrams}g</span>
            <span className="text-pos-text-secondary">Estimated rate</span>
            <span className="text-right font-medium">
              {fmtGHS(order.estimatedRate)}/g
            </span>
            <span className="text-pos-text-secondary">Estimated value</span>
            <span className="text-right font-medium">
              {fmtGHS(order.estimatedValue)}
            </span>
            <span className="text-pos-text-secondary">Amount paid</span>
            <span className="text-right font-medium">
              {fmtGHS(order.amountPaid)}
            </span>
          </div>
          {order.notes && (
            <p className="mt-3 text-[12px] text-pos-text-secondary">
              <span className="font-medium">Notes:</span> {order.notes}
            </p>
          )}
        </div>

        {/* Scrollable form area */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Mode toggle */}
          <div className="mb-5">
            <p className="mb-2 text-[12px] font-medium text-pos-text-primary">
              How would you like to reconcile?
            </p>
            <div className="flex rounded-lg border border-pos-border-secondary bg-pos-bg-secondary p-1">
              <button
                onClick={() => setMode("weight")}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-[12px] font-medium transition-colors",
                  mode === "weight"
                    ? "bg-pos-bg-primary text-pos-text-primary shadow-sm"
                    : "text-pos-text-secondary hover:text-pos-text-primary",
                )}
              >
                Weight was different
              </button>
              <button
                onClick={() => setMode("value")}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-[12px] font-medium transition-colors",
                  mode === "value"
                    ? "bg-pos-bg-primary text-pos-text-primary shadow-sm"
                    : "text-pos-text-secondary hover:text-pos-text-primary",
                )}
              >
                Set final amount
              </button>
            </div>
          </div>

          {/* Mode: weight */}
          {mode === "weight" && (
            <div className="flex flex-col gap-4">
              <p className="text-[12px] leading-relaxed text-pos-text-secondary">
                The true weight after assay differed from intake. Enter the
                corrected weight; the rate is pre-filled from the estimated rate
                but can be adjusted.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="corrected-weight" className="text-[13px]">
                  True weight (g)
                </Label>
                <Input
                  id="corrected-weight"
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={correctedWeight}
                  onChange={(e) => setCorrectedWeight(e.target.value)}
                  className="h-9 text-[13px]"
                  placeholder="0.000"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reconcile-rate" className="text-[13px]">
                  Rate (GHS / g)
                </Label>
                <div className="flex items-center">
                  <span className="flex h-9 items-center rounded-l-md border border-r-0 border-pos-border-secondary bg-pos-bg-secondary px-3 text-[13px] text-pos-text-secondary">
                    GHS
                  </span>
                  <Input
                    id="reconcile-rate"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="h-9 rounded-l-none text-[13px]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mode: value */}
          {mode === "value" && (
            <div className="flex flex-col gap-4">
              <p className="text-[12px] leading-relaxed text-pos-text-secondary">
                Enter the final agreed payout amount. A rate will be
                back-calculated from the recorded weight for bookkeeping.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="final-value" className="text-[13px]">
                  True value (GHS)
                </Label>
                <div className="flex items-center">
                  <span className="flex h-9 items-center rounded-l-md border border-r-0 border-pos-border-secondary bg-pos-bg-secondary px-3 text-[13px] text-pos-text-secondary">
                    GHS
                  </span>
                  <Input
                    id="final-value"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={finalValue}
                    onChange={(e) => setFinalValue(e.target.value)}
                    className="h-9 rounded-l-none text-[13px]"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                {valueModeValid && (
                  <p className="text-[12px] text-pos-text-secondary">
                    Back-calculated rate: {fmtGHS(trueRate)}/g
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Live preview */}
          {isValid && delta !== null && (
            <div className="mt-6 rounded-lg border border-pos-border-tertiary bg-pos-bg-secondary">
              <div className="border-b border-pos-border-tertiary px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-pos-text-tertiary">
                  Preview
                </p>
              </div>
              <div className="divide-y divide-pos-border-tertiary">
                <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="text-pos-text-secondary">True value</span>
                  <span className="font-medium text-pos-text-primary">
                    {fmtGHS(trueValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="text-pos-text-secondary">
                    Previously estimated
                  </span>
                  <span className="text-pos-text-secondary">
                    {fmtGHS(order.estimatedValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="font-medium text-pos-text-primary">
                    Ledger impact
                  </span>
                  <span
                    className={cn(
                      "font-semibold",
                      delta > 0
                        ? "text-pos-success"
                        : delta < 0
                          ? "text-pos-danger"
                          : "text-pos-text-secondary",
                    )}
                  >
                    {delta === 0
                      ? "No change"
                      : (delta > 0 ? "+ " : "− ") + fmtGHS(Math.abs(delta))}
                  </span>
                </div>
              </div>
              {delta !== 0 && (
                <p className="px-4 pb-3 pt-1 text-[11px] text-pos-text-secondary">
                  {delta > 0
                    ? "Customer was underpaid — a credit will be posted to their ledger."
                    : "Customer was overpaid — arrears will be posted to their ledger."}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <SheetFooter className="border-t border-pos-border-tertiary px-5 py-4">
          <Button
            className="h-9 w-full text-[13px]"
            disabled={!isValid || isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting ? "Confirming…" : "Confirm reconciliation"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const router = useRouter();
  const { sidebarUser } = useSessionContext();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  const [confirmedValues, setConfirmedValues] = useState<
    Record<string, number>
  >({});

  const ordersQuery = useQuery({
    queryKey: ["reconciliation-orders"],
    queryFn: () =>
      apiFetch("/api/reconciliation").then(
        (r) => r.json() as Promise<{ data: PendingOrder[] }>,
      ),
  });
  const orders = ordersQuery.data?.data ?? [];
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  const pendingCount = orders.length - confirmedIds.size;
  const totalEstimated = orders.reduce((s, o) => s + o.estimatedValue, 0);
  const totalTrueValue = Object.values(confirmedValues).reduce(
    (s, v) => s + v,
    0,
  );
  const netLedgerImpact = orders
    .filter((o) => confirmedIds.has(o.id))
    .reduce((s, o) => s + ((confirmedValues[o.id] ?? 0) - o.estimatedValue), 0);

  const allConfirmed = orders.length > 0 && confirmedIds.size === orders.length;

  const handleConfirmed = async (orderId: string, trueRate: number) => {
    const res = await apiFetch("/api/valuations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, trueRate }),
    });
    const data = (await res.json()) as {
      error?: string;
      valuation?: { trueValue: number };
    };
    if (!res.ok) throw new Error(data.error ?? "Failed to reconcile");
    const trueValue = data.valuation?.trueValue ?? 0;
    setConfirmedIds((prev) => new Set([...prev, orderId]));
    setConfirmedValues((prev) => ({ ...prev, [orderId]: trueValue }));
    setSelectedId(null);
    void queryClient.invalidateQueries({ queryKey: ["reconciliation-orders"] });
  };

  const summary = [
    { label: "Pending", value: String(pendingCount) },
    { label: "Total estimated", value: fmtGHS(totalEstimated) },
    {
      label: "Total true value",
      value: confirmedIds.size > 0 ? fmtGHS(totalTrueValue) : "—",
      dim: confirmedIds.size === 0,
    },
    {
      label: "Net ledger impact",
      value:
        confirmedIds.size > 0
          ? (netLedgerImpact >= 0 ? "+ " : "− ") +
            fmtGHS(Math.abs(netLedgerImpact))
          : "—",
      dim: confirmedIds.size === 0,
      colored:
        confirmedIds.size > 0
          ? netLedgerImpact >= 0
            ? "green"
            : "red"
          : undefined,
    },
  ];

  return (
    <DashboardShell activeItem="reconciliation" user={sidebarUser}>
      <RequiresNetwork>
        <Topbar
          title="Reconciliation"
          subtitle="Click an order to enter true assay values"
          actions={
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="rounded-full bg-pos-warning-soft px-3 py-1 text-[11px] font-medium text-pos-warning">
                  {pendingCount} pending
                </span>
              )}
              <Button
                className="h-8 bg-pos-brand px-3 text-[12px] font-medium text-white"
                disabled={!allConfirmed}
                onClick={() => router.push("/ledger")}
              >
                Finalise all &amp; post to ledgers
              </Button>
            </div>
          }
        />

        <div className="flex flex-col gap-4 p-5">
          {/* Warning banner */}
          <div className="flex items-center justify-between rounded-lg border border-pos-warning-mid bg-pos-warning-soft px-4 py-3 text-[12px] text-pos-warning">
            <span>
              Admin-only. Confirmed valuations update customer ledger balances
              immediately.
            </span>
            <span className="ml-4 shrink-0 font-medium">
              {confirmedIds.size} / {orders.length} confirmed
            </span>
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {summary.map((m) => (
              <div
                key={m.label}
                className="rounded-lg border border-pos-border-tertiary bg-pos-bg-primary px-4 py-3"
              >
                <p className="text-[11px] text-pos-text-secondary">{m.label}</p>
                <p
                  className={cn(
                    "mt-1 text-[18px] font-medium",
                    m.dim
                      ? "text-pos-text-tertiary"
                      : m.colored === "green"
                        ? "text-pos-success"
                        : m.colored === "red"
                          ? "text-pos-danger"
                          : "text-pos-text-primary",
                  )}
                >
                  {ordersQuery.isLoading ? (
                    <span className="inline-block h-5 w-20 animate-pulse rounded bg-pos-bg-secondary" />
                  ) : (
                    m.value
                  )}
                </p>
              </div>
            ))}
          </div>

          {/* Order table */}
          <div className="overflow-hidden rounded-lg border border-pos-border-tertiary bg-pos-bg-primary">
            <div className="overflow-x-auto">
              <div
                className={cn(
                  "grid min-w-[680px] gap-x-4 border-b border-pos-border-tertiary bg-pos-bg-secondary px-6 py-2 text-[11px] font-medium uppercase tracking-[0.04em] text-pos-text-tertiary",
                  RECONCILIATION_TABLE_COLUMNS,
                )}
              >
                <span>Order</span>
                <span>Customer</span>
                <span className="text-right">Weight</span>
                <span className="text-right">Est. value</span>
                <span>Status</span>
              </div>

              <div className="min-w-[680px]">
                {ordersQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))
                ) : orders.length === 0 ? (
                  <div className="px-5 py-12 text-center text-[13px] text-pos-text-secondary">
                    No pending orders to reconcile.
                  </div>
                ) : (
                  orders.map((order) => {
                    const isConfirmed = confirmedIds.has(order.id);
                    const isSelected = selectedId === order.id;

                    return (
                      <div
                        key={order.id}
                        onClick={() => {
                          if (!isConfirmed) setSelectedId(order.id);
                        }}
                        className={cn(
                          "grid items-center gap-x-4 border-b border-pos-border-tertiary px-6 py-3.5 text-[13px] transition-colors last:border-b-0",
                          RECONCILIATION_TABLE_COLUMNS,
                          isConfirmed
                            ? "cursor-default opacity-50"
                            : isSelected
                              ? "cursor-pointer bg-pos-brand-soft"
                              : "cursor-pointer hover:bg-pos-bg-secondary",
                        )}
                      >
                        <div className="text-[12px] text-pos-text-secondary">
                          {displayId(order)}
                        </div>
                        <div className="min-w-0 truncate pr-4 font-medium text-pos-text-primary">
                          {order.customerName}
                        </div>
                        <div className="text-right text-[12px] text-pos-text-secondary">
                          {order.weightGrams}g
                        </div>
                        <div className="text-right text-[13px] text-pos-text-primary">
                          {fmtGHS(order.estimatedValue)}
                        </div>
                        <div>
                          {isConfirmed ? (
                            <span className="flex items-center gap-1 text-[12px] font-medium text-pos-success">
                              <IconCheck className="size-3.5" />
                              Done
                            </span>
                          ) : (
                            <span
                              className={cn(
                                "text-[11px]",
                                isSelected
                                  ? "font-medium text-pos-brand"
                                  : "text-pos-text-tertiary",
                              )}
                            >
                              {isSelected ? "Open ↗" : "Click to reconcile"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* All confirmed banner */}
          {allConfirmed && (
            <div className="rounded-lg border border-pos-success-mid bg-pos-success-soft px-6 py-5 text-center">
              <div className="flex items-center justify-center gap-2 text-pos-success">
                <IconCheck className="size-4" />
                <span className="text-[15px] font-medium">
                  Reconciliation complete
                </span>
              </div>
              <p className="mt-2 text-[13px] text-pos-success-ink">
                All {orders.length} customer ledgers have been updated.
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
          )}
        </div>

        {/* Reconcile drawer */}
        <ReconcileDrawer
          order={selectedOrder}
          open={!!selectedId && !confirmedIds.has(selectedId)}
          onClose={() => setSelectedId(null)}
          onConfirmed={handleConfirmed}
        />
      </RequiresNetwork>
    </DashboardShell>
  );
}
