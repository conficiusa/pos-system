import type { PermissionsPerRole, ResourcePermissionChecks } from "@/lib/abac/types";
import { makeCanPerformActionFunc } from "@/lib/abac/utils";

export type ReportActions = {
  report: {
    actions: "view";
    type: undefined;
  };
};

const permissions: PermissionsPerRole<ReportActions> = {
  admin: {
    report: { view: true },
  },
  staff: {
    report: { view: true },
  },
};

const defaultPermissions: Partial<ResourcePermissionChecks<ReportActions>> =
  {};

export const canPerformReportAction = makeCanPerformActionFunc(
  permissions,
  defaultPermissions,
);
