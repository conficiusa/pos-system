import type { PermissionsPerRole, ResourcePermissionChecks } from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type SettingsActions = {
  user: {
    actions: "view" | "create" | "delete";
    type: { targetUser: { id: string } };
  };
};

const permissions: PermissionsPerRole<SettingsActions> = {
  admin: {
    user: { view: true, create: true, delete: true },
  },
};

const defaultPermissions: Partial<ResourcePermissionChecks<SettingsActions>> =
  {};

export const canPerformSettingsAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
