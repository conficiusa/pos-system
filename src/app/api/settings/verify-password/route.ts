import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json() as { password?: string }
  if (!body.password) return NextResponse.json({ error: "password is required" }, { status: 400 })

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: session.user.email,
        password: body.password,
      },
      asResponse: true,
    })
    // If better-auth returns a non-OK status, the password is wrong
    return NextResponse.json({ valid: result.ok })
  } catch {
    return NextResponse.json({ valid: false })
  }
}
