import type { SQL } from "drizzle-orm";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  userRole,
  UserRoleChangelog,
  userRoleChangelog,
} from "@/lib/db/schemas";
import { Role } from "@/lib/abac/types";
import { DB } from "@/lib/db";
import { paginate, PaginatedResult } from "@/services/utils/dal.utils";
import { canPerformUserRoleAction } from "./access.permissions";

class InsufficientAccessError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InsufficientAccessError";
  }
}

/**
 * Represents the roles that can be granted to users.
 *
 * Excludes the implicit "user" role, which is a default role that all users MUST have.
 */
export type GrantableRole = Exclude<Role, "super-admin" | "user">;

export class AccessService {
  constructor(private readonly db: DB) {}

  private getUserRolesCacheKey(userId: string): string {
    return `access:user-roles:${userId}`;
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const rolesFromDb = (
      await this.db
        .select({ role: userRole.role })
        .from(userRole)
        .where(eq(userRole.userId, userId))
    ).map((r) => r.role);

    // Ensure the "user" role is always included
    // This is a default role that all users MUST have.
    const roles = [...new Set<Role>(["user", ...rolesFromDb])];

    return roles;
  }

  private recordRoleChangelogEntry(args: {
    userId: string;
    role: GrantableRole;
    action: "grant" | "revoke";
    actorId: string;
    date: Date;
  }) {
    return this.db.insert(userRoleChangelog).values({
      ...args,
    });
  }

  async grantRoleToUser(args: {
    userId: string;
    role: GrantableRole;
    actorId: string;
  }) {
    const { userId, role, actorId } = args;

    const user = { id: userId, roles: [], activeOrg: null };
    const actor = {
      id: actorId,
      roles: await this.getUserRoles(actorId),
      activeOrg: null,
      emailVerified: false,
    };
    const actorHasPermission = canPerformUserRoleAction({
      user: actor,
      resource: "userRole",
      action: "grant",
      data: { targetUser: user, role },
    });
    if (!actorHasPermission) {
      throw new InsufficientAccessError("Only admins can grant roles to users");
    }

    const existing = (
      await this.db
        .select({ role: userRole.role })
        .from(userRole)
        .where(and(eq(userRole.userId, userId), eq(userRole.role, role)))
        .limit(1)
    )[0];
    if (existing) {
      return; // Role already granted
    }

    const now = new Date();

    await this.db.batch([
      this.db.insert(userRole).values({
        userId,
        role,
        actorId,
        createdAt: now,
      }),
      this.recordRoleChangelogEntry({
        userId,
        role,
        action: "grant",
        actorId,
        date: now,
      }),
    ]);
  }

  async revokeRoleFromUser(args: {
    userId: string;
    role: GrantableRole;
    actorId: string;
  }) {
    const { userId, role, actorId } = args;

    const user = { id: userId, roles: [], activeOrg: null };
    const actor = {
      id: actorId,
      roles: await this.getUserRoles(actorId),
      activeOrg: null,
      emailVerified: false,
    };
    const actorHasPermission = canPerformUserRoleAction({
      user: actor,
      resource: "userRole",
      action: "revoke",
      data: { targetUser: user, role },
    });
    if (!actorHasPermission) {
      throw new InsufficientAccessError(
        "Only admins can revoke roles from users",
      );
    }

    const existing = (
      await this.db
        .select({ userId: userRole.userId, role: userRole.role })
        .from(userRole)
        .where(and(eq(userRole.userId, userId), eq(userRole.role, role)))
        .limit(1)
    )[0];

    if (!existing) {
      return; // Role wasn't granted, nothing to revoke
    }

    const now = new Date();

    await this.db.batch([
      this.db
        .delete(userRole)
        .where(and(eq(userRole.userId, userId), eq(userRole.role, role))),
      this.recordRoleChangelogEntry({
        userId,
        role,
        action: "revoke",
        actorId,
        date: now,
      }),
    ]);
  }

  async getUserRoleChangelog(args: {
    filter?: { userId?: string } | { actorId?: string };
    page?: number;
    perPage?: number;
  }): Promise<PaginatedResult<UserRoleChangelog>> {
    const { filter = {}, page = 1, perPage: _perPage = 50 } = args;
    const perPage = Math.max(1, Math.min(_perPage, 200));
    const { limit, offset } = paginate(page, perPage);

    let mainFilter: SQL<unknown> | undefined = undefined;
    if ("userId" in filter && filter.userId !== undefined) {
      mainFilter = eq(userRoleChangelog.userId, filter.userId);
    } else if ("actorId" in filter && filter.actorId !== undefined) {
      mainFilter = eq(userRoleChangelog.actorId, filter.actorId);
    }

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          role: userRoleChangelog.role,
          action: userRoleChangelog.action,
          date: userRoleChangelog.date,
          actorId: userRoleChangelog.actorId,
          userId: userRoleChangelog.userId,
        })
        .from(userRoleChangelog)
        .where(mainFilter)
        .orderBy(desc(userRoleChangelog.date))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(userRoleChangelog)
        .where(mainFilter),
    ]);

    return { data, total, page, perPage };
  }
}
