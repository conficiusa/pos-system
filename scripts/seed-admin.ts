import * as p from "@clack/prompts";
import { createClient } from "@libsql/client";
import { D1Helper } from "@nerdfolio/drizzle-d1-helpers";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/libsql";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

import * as schema from "../src/lib/db/schemas";

type Target = "local" | "development" | "production";

function getTargetFromArgs(): Target | undefined {
  const idx = process.argv.indexOf("--target");
  if (idx === -1 || !process.argv[idx + 1]) return undefined;
  const val = process.argv[idx + 1];
  if (val === "local" || val === "development" || val === "production")
    return val;
  return undefined;
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

interface SeedData {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "admin" | "staff";
}

async function seedLocal(data: SeedData) {
  const d1 = D1Helper.get("DB", { environment: "development" });
  const sqlitePath = d1.sqliteLocalFileCredentials.url;

  const client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle(client, { schema });

  // Check if email already exists
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, data.email.toLowerCase()))
    .get();

  if (existing) {
    client.close();
    throw new Error(`A user with email "${data.email}" already exists.`);
  }

  const userId = nanoid();
  const accountId = nanoid();
  const now = new Date();
  const passwordHash = await hashPassword(data.password);

  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values({
      id: userId,
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
      role: "admin",
      banned: false,
      banReason: null,
      banExpires: null,
      phone: data.phone?.trim() || null,
    });

    await tx.insert(schema.account).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId: userId,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(schema.userRole).values({
      userId: userId,
      role: data.role,
      createdAt: now,
      actorId: userId,
    });

    await tx.insert(schema.userRoleChangelog).values({
      userId: userId,
      role: data.role,
      action: "grant",
      date: now,
      actorId: userId,
    });
  });

  client.close();
  return userId;
}

async function seedRemote(env: "development" | "production", data: SeedData) {
  const userId = nanoid();
  const accountId = nanoid();
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const passwordHash = await hashPassword(data.password);

  const sql = [
    `BEGIN TRANSACTION;`,
    `INSERT INTO "user" ("id", "name", "email", "email_verified", "image", "created_at", "updated_at", "role", "banned", "ban_reason", "ban_expires", "phone")`,
    `  VALUES ('${escapeSql(userId)}', '${escapeSql(data.name.trim())}', '${escapeSql(data.email.toLowerCase().trim())}', 1, NULL, ${nowMs}, ${nowMs}, 'admin', 0, NULL, NULL, ${data.phone ? `'${escapeSql(data.phone.trim())}'` : "NULL"});`,
    ``,
    `INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at")`,
    `  VALUES ('${escapeSql(accountId)}', '${escapeSql(userId)}', 'credential', '${escapeSql(userId)}', NULL, NULL, NULL, NULL, NULL, NULL, '${escapeSql(passwordHash)}', ${nowMs}, ${nowMs});`,
    ``,
    `INSERT INTO "user_role" ("user_id", "role", "created_at", "actor_id")`,
    `  VALUES ('${escapeSql(userId)}', '${escapeSql(data.role)}', ${nowSec}, '${escapeSql(userId)}');`,
    ``,
    `INSERT INTO "user_role_changelog" ("user_id", "role", "action", "date", "actor_id")`,
    `  VALUES ('${escapeSql(userId)}', '${escapeSql(data.role)}', 'grant', ${nowSec}, '${escapeSql(userId)}');`,
    `COMMIT;`,
  ].join("\n");

  const tmpFile = join(process.cwd(), `.seed-admin-${Date.now()}.sql`);
  try {
    writeFileSync(tmpFile, sql, "utf-8");
    execSync(
      `pnpm exec wrangler d1 execute DB --remote --env=${env} --file="${tmpFile}"`,
      {
        stdio: "inherit",
      },
    );
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }

  return userId;
}

async function main() {
  p.intro("🔐 GoldPOS — Seed Admin Account");

  let target = getTargetFromArgs();

  if (!target) {
    const selected = await p.select({
      message: "Target environment",
      options: [
        {
          value: "local",
          label: "Local",
          hint: "Local wrangler D1 SQLite file",
        },
        { value: "development", label: "Development", hint: "Remote D1 — dev" },
        { value: "production", label: "Production", hint: "Remote D1 — prod" },
      ],
    });
    if (p.isCancel(selected)) {
      p.cancel("Seed cancelled.");
      process.exit(0);
    }
    target = selected as Target;
  }

  if (target !== "local") {
    const confirmed = await p.confirm({
      message: `You are about to seed the REMOTE ${target.toUpperCase()} database. Continue?`,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Seed cancelled.");
      process.exit(0);
    }
  }

  const values = await p.group(
    {
      name: () =>
        p.text({
          message: "Full name",
          placeholder: "e.g. Ahmed Al-Farsi",
          validate: (v) => {
            if (!v || v.trim().length < 2)
              return "Name must be at least 2 characters";
          },
        }),
      email: () =>
        p.text({
          message: "Email address",
          placeholder: "admin@example.com",
          validate: (v) => {
            if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
              return "Please enter a valid email";
          },
        }),
      phone: () =>
        p.text({
          message: "Phone (E.164 format, optional)",
          placeholder: "+971501234567",
          validate: (v) => {
            if (v && !/^\+[1-9]\d{1,14}$/.test(v))
              return "Phone must be in E.164 format (e.g. +971501234567)";
          },
        }),
      password: () =>
        p.password({
          message: "Password",
          validate: (v) => {
            if (!v || v.length < 8)
              return "Password must be at least 8 characters";
          },
        }),
      confirmPassword: ({ results }) =>
        p.password({
          message: "Confirm password",
          validate: (v) => {
            if (v !== results.password) return "Passwords do not match";
          },
        }),
      role: () =>
        p.select({
          message: "ABAC role to assign",
          options: [
            {
              value: "admin",
              label: "Admin",
              hint: "Full access to all features",
            },
            { value: "staff", label: "Staff", hint: "Day-to-day operations" },
          ],
        }),
    },
    {
      onCancel: () => {
        p.cancel("Seed cancelled.");
        process.exit(0);
      },
    },
  );

  const seedData: SeedData = {
    name: values.name,
    email: values.email,
    phone: values.phone,
    password: values.password,
    role: values.role as "admin" | "staff",
  };

  const spin = p.spinner();
  spin.start(`Seeding admin account on ${target}…`);

  let userId: string;
  try {
    if (target === "local") {
      userId = await seedLocal(seedData);
    } else {
      userId = await seedRemote(target, seedData);
    }
  } catch (err) {
    spin.stop("Failed.");
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  spin.stop("Admin account created!");

  p.note(
    [
      `Name:   ${values.name}`,
      `Email:  ${values.email}`,
      `Role:   ${values.role}`,
      `Target: ${target}`,
      `UserID: ${userId}`,
    ].join("\n"),
    "Account details",
  );

  p.outro("Done — you can now log in with these credentials.");
}

main().catch((err) => {
  p.cancel("An unexpected error occurred.");
  console.error(err);
  process.exit(1);
});
