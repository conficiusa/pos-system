import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { auth } from "@/lib/auth"
import { canPerformSettingsAction } from "@/services/settings/settings.permissions"
import { appSettings } from "@/lib/db/schemas/app-settings.schema"
import { user } from "@/lib/db/schemas/better-auth.schema"
import { eq } from "drizzle-orm"

const RATE_KEY = "gold_rate"
const DEFAULT_RATE = 380

export async function GET(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const row = await db
    .select({
      value: appSettings.value,
      updatedAt: appSettings.updatedAt,
      updatedByName: user.name,
    })
    .from(appSettings)
    .leftJoin(user, eq(appSettings.updatedBy, user.id))
    .where(eq(appSettings.key, RATE_KEY))
    .limit(1)

  const rate = row[0] ? parseFloat(row[0].value) : DEFAULT_RATE

  return NextResponse.json({
    rate,
    updatedAt: row[0]?.updatedAt ?? null,
    updatedBy: row[0]?.updatedByName ?? null,
  })
}

export async function PUT(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const actor = { id: session.user.id, roles: session.user.roles ?? [], activeOrg: null, emailVerified: session.user.emailVerified }

  // Only admins can update the rate
  const canUpdate = canPerformSettingsAction({ user: actor, resource: "user", action: "create" })
  if (!canUpdate) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json() as { rate?: unknown }
  const rate = parseFloat(String(body.rate ?? ""))
  if (isNaN(rate) || rate <= 0) {
    return NextResponse.json({ error: "Rate must be a positive number" }, { status: 400 })
  }

  const now = new Date()
  await db
    .insert(appSettings)
    .values({ key: RATE_KEY, value: String(rate), updatedAt: now, updatedBy: session.user.id })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(rate), updatedAt: now, updatedBy: session.user.id },
    })

  return NextResponse.json({ rate, updatedAt: now })
}
