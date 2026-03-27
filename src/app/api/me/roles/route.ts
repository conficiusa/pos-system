import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { auth } from "@/lib/auth"
import { AccessService } from "@/services/access/access.service"

export async function GET(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const accessService = new AccessService(db)
  const roles = await accessService.getUserRoles(session.user.id)

  return NextResponse.json({ roles })
}
