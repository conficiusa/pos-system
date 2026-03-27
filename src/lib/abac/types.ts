/* eslint-disable @typescript-eslint/consistent-indexed-object-style */

export type User = {
  id: string;
  roles: Role[];
  activeOrg: string | null;
  emailVerified: boolean;
};

export type Role = "super-admin" | "admin" | "staff" | "user";

export type ActionsPerResource = Record<
  string,
  { type: unknown; actions: string }
>;

/**
 * @template Actions - ActionsPerResource - represents the actions that could be performed on a resource
 * @template Resource - Resource - union of keys of {@link Actions}, represents the various resources available to be acted on
 */
export type PermissionCheck<
  Actions extends ActionsPerResource,
  Resource extends keyof Actions = keyof Actions,
> = boolean | ((user: User, data?: Actions[Resource]["type"]) => boolean);

export type ResourcePermissionChecks<Actions extends ActionsPerResource> = {
  [Resource in keyof Actions]: Partial<{
    [Action in Actions[Resource]["actions"]]: PermissionCheck<
      Actions,
      Resource
    >;
  }>;
};

export type PermissionsPerRole<Actions extends ActionsPerResource> = Partial<{
  [R in Role]: Partial<ResourcePermissionChecks<Actions>>;
}>;

export type CanPerformActionArgs<
  Actions extends ActionsPerResource,
  Resource extends keyof Actions = keyof Actions,
> = {
  user: User;
  resource: Resource;
  action: Actions[Resource]["actions"];
  data?: Actions[Resource]["type"];
};

export type CanPerformAction<Action extends ActionsPerResource> = (
  args: CanPerformActionArgs<Action>,
) => boolean;
