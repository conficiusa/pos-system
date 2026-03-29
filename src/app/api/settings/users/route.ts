import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canPerformSettingsAction } from "@/services/settings/settings.permissions";
import { user as userTable } from "@/lib/db/schemas/better-auth.schema";
import { userRole } from "@/lib/db/schemas/access.schema";
import { eq } from "drizzle-orm";

async function getActorWithPermission(request: NextRequest) {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {}
  if (!session) return null;

  const db = getDb();
  const actor = {
    id: session.user.id,
    roles: session.user.roles ?? [],
    activeOrg: null,
    emailVerified: session.user.emailVerified,
  };

  const canView = canPerformSettingsAction({
    user: actor,
    resource: "user",
    action: "view",
  });
  if (!canView) return null;

  return { session, actor, db };
}

export async function GET(request: NextRequest) {
  const ctx = await getActorWithPermission(request);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { db } = ctx;

  // List all users with their roles from our userRole table
  const users = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      createdAt: userTable.createdAt,
      banned: userTable.banned,
      phone: userTable.phone,
    })
    .from(userTable)
    .orderBy(userTable.createdAt);

  // Attach custom roles from the userRole table
  const allRoles = await db
    .select({ userId: userRole.userId, role: userRole.role })
    .from(userRole);
  const rolesByUser: Record<string, string[]> = {};
  for (const r of allRoles) {
    if (!rolesByUser[r.userId]) rolesByUser[r.userId] = [];
    rolesByUser[r.userId].push(r.role);
  }

  const result = users.map((u) => ({
    ...u,
    grantedRoles: rolesByUser[u.id] ?? [],
  }));

  return NextResponse.json({ data: result });
}

export async function POST(request: NextRequest) {
  let session = null;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch {}
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const actor = {
    id: session.user.id,
    roles: session.user.roles ?? [],
    activeOrg: null,
    emailVerified: session.user.emailVerified,
  };

  const canCreate = canPerformSettingsAction({
    user: actor,
    resource: "user",
    action: "create",
  });
  if (!canCreate)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  };

  if (!body.name?.trim())
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!body.email?.trim())
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!body.phone?.trim())
    return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  if (!body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  try {
    // Use better-auth's signUpEmail to create the user — consistent password hashing
    const signUpResponse = await auth.api.signUpEmail({
      body: {
        name: body.name.trim(),
        email: body.email.trim().toLowerCase(),
        password: body.password,
        phone: body.phone?.trim(),
      },
      asResponse: true,
    });

    if (!signUpResponse.ok) {
      const errBody = (await signUpResponse.json()) as { message?: string };
      const msg = errBody.message ?? "Failed to create user";
      if (msg.toLowerCase().includes("already")) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Get the newly created user by email
    const created = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(eq(userTable.email, body.email.trim().toLowerCase()))
      .limit(1);

    // Update phone if provided
    if (body.phone && created[0]) {
      await db
        .update(userTable)
        .set({ phone: body.phone })
        .where(eq(userTable.id, created[0].id));
    }

    return NextResponse.json({ data: created[0] }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create user";
    if (
      msg.toLowerCase().includes("unique") ||
      msg.toLowerCase().includes("already")
    ) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
