import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { auth } from "@/lib/auth"
import { AccessService, type GrantableRole } from "@/services/access/access.service"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: targetUserId } = await params
  const body = await request.json() as { role?: string }

  if (!body.role) return NextResponse.json({ error: "role is required" }, { status: 400 })

  const db = getDb()
  const accessService = new AccessService(db)

  try {
    await accessService.grantRoleToUser({
      userId: targetUserId,
      role: body.role as GrantableRole,
      actorId: session.user.id,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to grant role"
    return NextResponse.json({ error: msg }, { status: 403 })
  }
}
