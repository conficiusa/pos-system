import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { customersService } from "@/services/customers/customers.service"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const perPage = Math.min(200, parseInt(searchParams.get("perPage") ?? "50"))

  if (q && q.trim()) {
    const data = await customersService.search(db, q.trim())
    return NextResponse.json({ data, total: data.length, page: 1, perPage: data.length })
  }

  const result = await customersService.list(db, page, perPage)
  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  let session = null
  try {
    session = await auth.api.getSession({ headers: request.headers })
  } catch {}
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = getDb()
  const body = await request.json() as Record<string, string | undefined>

  try {
    const customer = await customersService.create(db, {
      id: body.id,
      name: body.name as string,
      phone: body.phone as string,
      idType: body.idType,
      idNumber: body.idNumber,
      notes: body.notes,
      createdBy: body.createdBy ?? session.user.id,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    })
    return NextResponse.json(customer, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create customer"
    if (msg === "name is required" || msg === "phone is required") {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    if (msg.includes("UNIQUE") || msg.includes("unique")) {
      return NextResponse.json({ error: "A customer with this phone number already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
