import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { ordersService } from "@/services/orders/orders.service"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") as "pending" | "reconciled" | null
  const q = searchParams.get("q")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const perPage = Math.min(200, parseInt(searchParams.get("perPage") ?? "50"))

  const result = await ordersService.list(db, {
    status: status ?? undefined,
    q: q ?? undefined,
    page,
    perPage,
  })
  return NextResponse.json(result)
}
