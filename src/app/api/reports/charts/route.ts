import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { reportsService } from "@/services/reports/reports.service"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const data = await reportsService.getChartData(db)
  return NextResponse.json(data)
}
