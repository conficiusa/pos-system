import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { customers, orders } from "@/lib/db/schemas";
import { auth } from "@/lib/auth";
import { gte } from "drizzle-orm";

/**
 * GET /api/sync/pull?since={iso8601}
 *
 * Returns customers and orders modified after the given timestamp.
 * Used by the client-side hydrateFromServer() for incremental updates
 * after the initial full seed.
 *
 * The `since` parameter must be a valid ISO 8601 datetime string.
 * All timestamps in the database are stored as ISO 8601 strings (SQLite text).
 */
export async function GET(request: NextRequest) {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {}
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");

  if (!since) {
    return NextResponse.json(
      { error: "since parameter is required" },
      { status: 400 },
    );
  }

  // Validate the since parameter is parseable as a date.
  const sinceDate = new Date(since);
  if (isNaN(sinceDate.getTime())) {
    return NextResponse.json(
      { error: "since must be a valid ISO 8601 datetime" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Fetch all records updated after `since`. D1 stores timestamps as ISO text,
  // so string comparison works correctly for ISO 8601 format.
  const [updatedCustomers, updatedOrders] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(gte(customers.updatedAt, since)),
    db
      .select()
      .from(orders)
      .where(gte(orders.updatedAt, since)),
  ]);

  return NextResponse.json({
    customers: updatedCustomers,
    orders: updatedOrders,
    since,
    pulledAt: new Date().toISOString(),
  });
}
