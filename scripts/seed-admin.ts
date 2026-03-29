/**
 * Seed an admin (client) account into the database.
 *
 * Usage:
 *   pnpm seed:admin
 *   pnpm seed:admin --target local
 *   pnpm seed:admin --target development
 *   pnpm seed:admin --target production
 *
 * This script is intended for the super-admin (developer) to bootstrap
 * the client's admin account on a fresh deployment. The client then uses
 * the dashboard to create staff accounts.
 */

import * as p from "@clack/prompts";
import { createClient } from "@libsql/client";
import { D1Helper } from "@nerdfolio/drizzle-d1-helpers";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import * as schema from "../src/lib/db/schemas/index.js";

type Target = "local" | "development" | "production";

function getTargetFromArgs(): Target | undefined {
  const idx = process.argv.indexOf("--target");
  if (idx === -1 || !process.argv[idx + 1]) return undefined;
  const val = process.argv[idx + 1];
  if (val === "local" || val === "development" || val === "production")
    return val;
  return undefined;
}

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

interface SeedData {
  name: string;
  email: string;
  password: string;
}

async function seedLocal(data: SeedData): Promise<string> {
  const d1 = D1Helper.get("DB", { environment: "development" });
  const sqlitePath = d1.sqliteLocalFileCredentials.url;

  const client = createClient({ url: `file:${sqlitePath}` });
  const db = drizzle(client, { schema });

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
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      phone: null,
    });

    await tx.insert(schema.account).values({
      id: nanoid(),
      accountId: userId,
      providerId: "credential",
      userId,
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
      userId,
      role: "admin",
      createdAt: now,
      actorId: userId,
    });

    await tx.insert(schema.userRoleChangelog).values({
      userId,
      role: "admin",
      action: "grant",
      date: now,
      actorId: userId,
    });
  });

  client.close();
  return userId;
}

async function seedRemote(
  env: "development" | "production",
  data: SeedData,
): Promise<string> {
  const userId = nanoid();
  const accountId = nanoid();
  // user/account use timestamp_ms (milliseconds); userRole/changelog use timestamp (seconds)
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const passwordHash = await hashPassword(data.password);
  const email = data.email.toLowerCase().trim();
  const name = data.name.trim();

  // D1 remote wraps each --file execution in a transaction automatically.
  // Manual BEGIN/COMMIT are not supported and will cause an error.
  const sql = [
    `INSERT INTO "user" ("id","name","email","email_verified","image","created_at","updated_at","role","banned","ban_reason","ban_expires","phone")`,
    `  VALUES ('${esc(userId)}','${esc(name)}','${esc(email)}',1,NULL,${nowMs},${nowMs},'user',0,NULL,NULL,NULL);`,

    `INSERT INTO "account" ("id","account_id","provider_id","user_id","access_token","refresh_token","id_token","access_token_expires_at","refresh_token_expires_at","scope","password","created_at","updated_at")`,
    `  VALUES ('${esc(accountId)}','${esc(userId)}','credential','${esc(userId)}',NULL,NULL,NULL,NULL,NULL,NULL,'${esc(passwordHash)}',${nowMs},${nowMs});`,

    `INSERT INTO "user_role" ("user_id","role","created_at","actor_id")`,
    `  VALUES ('${esc(userId)}','admin',${nowSec},'${esc(userId)}');`,

    `INSERT INTO "user_role_changelog" ("user_id","role","action","date","actor_id")`,
    `  VALUES ('${esc(userId)}','admin','grant',${nowSec},'${esc(userId)}');`,
  ].join("\n");

  const tmpFile = join(process.cwd(), `.seed-admin-${Date.now()}.sql`);
  try {
    writeFileSync(tmpFile, sql, "utf-8");
    const envFlag = env === "production" ? "--env=production" : "--env=development";
    execSync(
      `pnpm exec wrangler d1 execute DB --remote ${envFlag} --file="${tmpFile}"`,
      { stdio: "inherit" },
    );
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }

  return userId;
}

async function main() {
  p.intro("GoldPOS — Seed Admin Account");

  let target = getTargetFromArgs();

  if (!target) {
    const selected = await p.select({
      message: "Target environment",
      options: [
        { value: "local", label: "Local", hint: "Local wrangler D1 SQLite file" },
        { value: "development", label: "Development", hint: "Remote D1 — dev" },
        { value: "production", label: "Production", hint: "Remote D1 — prod" },
      ],
    });
    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    target = selected as Target;
  }

  if (target !== "local") {
    const confirmed = await p.confirm({
      message: `You are about to seed the REMOTE ${target.toUpperCase()} database. Continue?`,
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel("Cancelled.");
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
    },
    {
      onCancel: () => {
        p.cancel("Cancelled.");
        process.exit(0);
      },
    },
  );

  const spin = p.spinner();
  spin.start(`Seeding admin account on ${target}…`);

  let userId: string;
  try {
    if (target === "local") {
      userId = await seedLocal(values);
    } else {
      userId = await seedRemote(target, values);
    }
  } catch (err) {
    spin.stop("Failed.");
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  spin.stop("Done!");

  p.note(
    [
      `Name:   ${values.name}`,
      `Email:  ${values.email}`,
      `Target: ${target}`,
      `UserID: ${userId}`,
    ].join("\n"),
    "Account created",
  );

  p.outro("The client can now log in with these credentials.");
}

main().catch((err) => {
  p.cancel("An unexpected error occurred.");
  console.error(err);
  process.exit(1);
});
