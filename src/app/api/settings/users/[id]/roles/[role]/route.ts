import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { auth } from "@/lib/auth"
import { AccessService, type GrantableRole } from "@/services/access/access.service"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; role: string }> },
) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: targetUserId, role } = await params

  const db = getDb()
  const accessService = new AccessService(db)

  try {
    await accessService.revokeRoleFromUser({
      userId: targetUserId,
      role: role as GrantableRole,
      actorId: session.user.id,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to revoke role"
    return NextResponse.json({ error: msg }, { status: 403 })
  }
}
