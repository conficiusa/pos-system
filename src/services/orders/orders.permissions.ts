import type { PermissionsPerRole, ResourcePermissionChecks } from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type OrderActions = {
  order: {
    actions: "view" | "create" | "update" | "delete";
    type: { order: { createdBy: string } };
  };
};

const permissions: PermissionsPerRole<OrderActions> = {
  admin: {
    order: { view: true, create: true, update: true, delete: true },
  },
  staff: {
    order: { view: true, create: true, update: true },
  },
};

const defaultPermissions: Partial<ResourcePermissionChecks<OrderActions>> = {
  // All authenticated users can view orders (the "user" role is assigned to everyone)
  order: { view: true },
};

export const canPerformOrderAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
