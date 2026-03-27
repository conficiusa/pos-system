import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { valuationsService } from "@/services/valuation/valuations.service"
import { auth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { orderId, trueRate } = (await request.json()) as {
    orderId: string
    trueRate: number
  }

  const db = getDb()

  try {
    const valuation = await valuationsService.process(db, {
      orderId,
      trueRate,
      processedBy: session.user.id,
    })
    return NextResponse.json({ ok: true, valuation })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to process valuation"
    if (msg === "Order not found") return NextResponse.json({ error: msg }, { status: 404 })
    if (msg === "Order already reconciled") return NextResponse.json({ error: msg }, { status: 409 })
    if (msg.includes("required") || msg.includes("positive")) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
