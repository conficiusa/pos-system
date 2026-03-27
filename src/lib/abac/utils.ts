import type {
  ActionsPerResource,
  CanPerformAction,
  CanPerformActionArgs,
  PermissionsPerRole,
  ResourcePermissionChecks,
  User,
} from "./types";

/**
 * A generic factory function that returns a function
 * which checks if a user has permission to perform an action on a resource
 *
 * @returns A function that checks if a user has permission to perform an action on a resource
 */
export function makeCanPerformActionFunc<A extends ActionsPerResource>(
  permissionsPerRole: PermissionsPerRole<A>,
  defaultPermissions: Partial<ResourcePermissionChecks<A>>,
): CanPerformAction<A> {
  /**
   * Returns true if a user has permission to perform an action on a resource
   */
  function canPerformAction(args: CanPerformActionArgs<A>): boolean {
    const { user, resource, action, data } = args;
    return user.roles.some((role) => {
      const defaultPermission = defaultPermissions[resource]?.[action];
      const rolePermission = permissionsPerRole[role]?.[resource]?.[action];

      const permission = rolePermission ?? defaultPermission;
      if (permission === undefined) return false;

      if (typeof permission === "boolean") return permission;
      return permission(user, data);
    });
  }

  return canPerformAction;
}
