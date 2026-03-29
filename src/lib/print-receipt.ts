import { businessConfig } from "@/lib/business-config"

type ReceiptOrder = {
  id: string
  orderNumber: string | null
  customerName: string
  customerPhone: string
  createdAt: string
  weightGrams: number
  estimatedRate: number
  estimatedValue: number
  amountPaid: number
  notes: string | null
  status: string
}

const displayId = (o: Pick<ReceiptOrder, "id" | "orderNumber">) =>
  o.orderNumber ?? `#${o.id.slice(0, 6).toUpperCase()}`

const fmt = (n: number) =>
  "GHS " + n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const DASH = "- - - - - - - - - - - - - - - - - -"

const row = (label: string, value: string) =>
  `<div class="row"><span>${label}</span><span class="val">${value}</span></div>`

export function printOrderReceipt(order: ReceiptOrder): void {
  const w = window.open("", "_blank", "width=420,height=700,menubar=no,toolbar=no,location=no")
  if (!w) return

  const footerLines = businessConfig.receiptFooter
    .split("\n")
    .map((l) => `<p>${l}</p>`)
    .join("")

  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt ${displayId(order)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      color: #000;
      background: #fff;
      width: 320px;
      margin: 0 auto;
      padding: 20px 12px 24px;
    }

    /* ── Header ── */
    .header { text-align: center; margin-bottom: 4px; }
    .biz-name {
      font-size: 15px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .tagline { font-size: 10px; margin-top: 2px; color: #444; }
    .receipt-title {
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-top: 6px;
    }

    /* ── Dividers ── */
    .dash {
      text-align: center;
      font-size: 10px;
      color: #aaa;
      margin: 8px 0;
      white-space: nowrap;
      overflow: hidden;
    }
    .solid {
      border-top: 1px solid #000;
      margin: 8px 0;
    }

    /* ── Rows ── */
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 3px 0;
      line-height: 1.5;
    }
    .row span { max-width: 55%; }
    .row .val { text-align: right; font-weight: bold; }

    /* ── Section label ── */
    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #555;
      margin-bottom: 4px;
    }

    /* ── Total ── */
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 14px;
      font-weight: bold;
      margin: 4px 0;
    }

    /* ── Status badge ── */
    .status {
      display: inline-block;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      border: 1px solid #000;
      padding: 1px 6px;
    }

    /* ── Notes ── */
    .notes-block {
      font-size: 11px;
      color: #333;
      margin-top: 2px;
      word-break: break-word;
    }

    /* ── Footer ── */
    .footer {
      text-align: center;
      font-size: 10px;
      color: #555;
      line-height: 1.6;
    }

    /* ── Print button (screen only) ── */
    .print-btn {
      display: block;
      margin: 20px auto 0;
      padding: 8px 28px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      background: #000;
      color: #fff;
      border: none;
      letter-spacing: 0.04em;
    }

    @media print {
      body { width: 100%; padding: 0 4px; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div class="biz-name">${businessConfig.name}</div>
    <div class="tagline">${businessConfig.tagline}</div>
  </div>

  <div class="dash">${DASH}</div>

  <div class="header">
    <div class="receipt-title">Gold Purchase Receipt</div>
  </div>

  <div class="dash">${DASH}</div>

  ${row("Order #", displayId(order))}
  ${row("Date", fmtDate(order.createdAt))}

  <div class="dash">${DASH}</div>

  <div class="section-label">Customer</div>
  ${row("Name", order.customerName)}
  ${row("Phone", order.customerPhone || "—")}

  <div class="dash">${DASH}</div>

  <div class="section-label">Transaction Details</div>
  ${row("Weight", order.weightGrams + " g")}
  ${row("Rate", fmt(order.estimatedRate) + "/g")}
  ${row("Est. Value", fmt(order.estimatedValue))}

  <div class="solid"></div>

  <div class="total-row">
    <span>Amount Paid</span>
    <span>${fmt(order.amountPaid)}</span>
  </div>

  <div class="solid"></div>

  <div class="row">
    <span>Status</span>
    <span class="status">${order.status === "reconciled" ? "Reconciled" : "Pending"}</span>
  </div>

  ${
    order.notes
      ? `<div class="dash">${DASH}</div>
         <div class="section-label">Notes</div>
         <div class="notes-block">${order.notes}</div>`
      : ""
  }

  <div class="dash">${DASH}</div>

  <div class="footer">${footerLines}</div>

  <button class="print-btn" onclick="window.print()">Print Receipt</button>

</body>
</html>`)

  w.document.close()
  w.focus()
  // Small delay lets the browser finish rendering before triggering print
  setTimeout(() => w.print(), 300)
}
