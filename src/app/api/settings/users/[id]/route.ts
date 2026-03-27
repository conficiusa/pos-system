import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { auth } from "@/lib/auth"
import { AccessService } from "@/services/access/access.service"
import { canPerformSettingsAction } from "@/services/settings/settings.permissions"
import { user as userTable } from "@/lib/db/schemas/better-auth.schema"
import { userRole, userRoleChangelog } from "@/lib/db/schemas/access.schema"
import { eq } from "drizzle-orm"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: targetUserId } = await params

  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })
  }

  const db = getDb()
  const accessService = new AccessService(db)
  const roles = await accessService.getUserRoles(session.user.id)
  const actor = { id: session.user.id, roles, activeOrg: null, emailVerified: session.user.emailVerified }

  const canDelete = canPerformSettingsAction({
    user: actor,
    resource: "user",
    action: "delete",
    data: { targetUser: { id: targetUserId } },
  })
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Check the target user exists
  const target = await db.select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, targetUserId))
    .limit(1)

  if (!target[0]) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Clean up rows without cascade FK before deleting the user
  await db.delete(userRoleChangelog).where(eq(userRoleChangelog.userId, targetUserId))
  await db.delete(userRole).where(eq(userRole.userId, targetUserId))
  // sessions and accounts have ON DELETE CASCADE on user.id
  await db.delete(userTable).where(eq(userTable.id, targetUserId))

  return NextResponse.json({ success: true })
}
