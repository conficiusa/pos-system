import type {
  PermissionsPerRole,
  ResourcePermissionChecks,
  Role,
} from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type UserRoleActions = {
  userRole: {
    actions: "grant" | "revoke";
    // The data passed to the action functions
    type: {
      role: Role;
      targetUser: { id: string };
    };
  };
  userRoleChangelog: {
    actions: "view";
    type: { targetUser: { id: string } };
  };
};
const permissions: PermissionsPerRole<UserRoleActions> = {
  admin: {
    // An admin can grant/revoke any role to/from any user
    userRole: { grant: true, revoke: true },

    // An admin can view any user's role changelog
    userRoleChangelog: { view: true },
  },
};
const defaultPermissions: Partial<ResourcePermissionChecks<UserRoleActions>> = {
  userRoleChangelog: {
    // Any user can view their own role changelog
    view: (authUser, data) => authUser.id === data?.targetUser.id,
  },
};
export const canPerformUserRoleAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
