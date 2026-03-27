import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { auth } from "@/lib/auth"
import { customerQueries } from "@/services/customers/customers.dal"
import { ledgerQueries } from "@/services/valuation/valuation"
import { nanoid } from "nanoid"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: customerId } = await params
  const db = getDb()

  const customer = await customerQueries.getById(db, customerId)
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const body = await request.json() as { amount?: unknown; note?: string }
  const amount = parseFloat(String(body.amount ?? ""))
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 })
  }

  const balance = customer.ledgerBalance ?? 0

  // Determine direction from current balance
  // Positive balance = business owes customer (credit) → paying it out → ledger delta is negative
  // Negative balance = customer owes business (arrears) → receiving payment → ledger delta is positive
  if (balance === 0) {
    return NextResponse.json({ error: "Customer has no outstanding balance to settle" }, { status: 400 })
  }

  const isPayingOutCredit = balance > 0
  // Cap at the actual balance so we never over-settle
  const cappedAmount = Math.min(amount, Math.abs(balance))
  const ledgerDelta = isPayingOutCredit ? -cappedAmount : cappedAmount

  const description = body.note?.trim()
    ? body.note.trim()
    : isPayingOutCredit
      ? `Credit payout — cash settlement`
      : `Arrears received — cash settlement`

  await Promise.all([
    ledgerQueries.create(db, {
      id: nanoid(),
      customerId,
      orderId: null,
      valuationId: null,
      amount: ledgerDelta,
      type: "settlement",
      description,
      createdBy: session.user.id,
      createdAt: new Date().toISOString(),
    }),
    customerQueries.adjustBalance(db, customerId, ledgerDelta),
  ])

  const updatedCustomer = await customerQueries.getById(db, customerId)

  return NextResponse.json({
    settled: cappedAmount,
    remainingBalance: updatedCustomer?.ledgerBalance ?? 0,
  })
}
