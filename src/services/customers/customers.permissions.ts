import type { PermissionsPerRole, ResourcePermissionChecks } from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type CustomerActions = {
  customer: {
    actions: "view" | "create" | "update" | "delete";
    type: { customer: { createdBy: string } };
  };
};

const permissions: PermissionsPerRole<CustomerActions> = {
  admin: {
    customer: { view: true, create: true, update: true, delete: true },
  },
  staff: {
    customer: { view: true, create: true, update: true },
  },
};

const defaultPermissions: Partial<ResourcePermissionChecks<CustomerActions>> =
  {
    // All authenticated users can view customers
    customer: { view: true },
  };

export const canPerformCustomerAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
