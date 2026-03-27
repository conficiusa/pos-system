import type { PermissionsPerRole, ResourcePermissionChecks } from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type LedgerActions = {
  ledger: {
    actions: "view";
    type: undefined;
  };
};

const permissions: PermissionsPerRole<LedgerActions> = {
  admin: {
    ledger: { view: true },
  },
  staff: {
    ledger: { view: true },
  },
};

const defaultPermissions: Partial<ResourcePermissionChecks<LedgerActions>> =
  {};

export const canPerformLedgerAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
