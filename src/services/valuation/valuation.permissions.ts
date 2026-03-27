import type { PermissionsPerRole, ResourcePermissionChecks } from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type ValuationActions = {
  valuation: {
    actions: "view" | "process";
    type: undefined;
  };
};

const permissions: PermissionsPerRole<ValuationActions> = {
  admin: {
    valuation: { view: true, process: true },
  },
  staff: {
    valuation: { view: true, process: true },
  },
};

const defaultPermissions: Partial<
  ResourcePermissionChecks<ValuationActions>
> = {};

export const canPerformValuationAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
