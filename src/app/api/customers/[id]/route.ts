import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { customersService } from "@/services/customers/customers.service"
import { orderQueries } from "@/services/orders/orders.dal"
import { auth } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const db = getDb()

  const stats = await customersService.getWithStats(db, id)
  if (!stats) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const recentOrders = await orderQueries.getByCustomer(db, id)

  return NextResponse.json({
    customer: stats.customer,
    orderCount: stats.orderCount,
    totalPaid: stats.totalPaid,
    recentOrders,
  })
}
