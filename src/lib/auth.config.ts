import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, customSession } from "better-auth/plugins";
import { z } from "zod/v4";

import {
  CACHED_COOKIE_MAX_AGE,
  SESSION_EXPIRES_AFTER,
  SESSION_FRESH_AGE,
  SESSION_UPDATE_AGE,
} from "@/lib/auth.constants";
import * as betterAuthSchemas from "@/lib/db/schemas/better-auth.schema";
import { AuthConfigEnvVar } from "@/lib/get-env";
import { DB } from "./db";
import { AccessService } from "@/services/access/access.service";

type Args = {
  db: DB;
  config: AuthConfigEnvVar;
  accessService: AccessService;
};

export const getAuthOptions = (args: Args) => {
  const { db, config, accessService } = args;

  const database = drizzleAdapter(db, {
    // The provider is set to "sqlite" for Cloudflare D1 databases.
    provider: "sqlite",
    schema: betterAuthSchemas, // https://www.better-auth.com/docs/adapters/drizzle#additional-information
    debugLogs: false,
  });

  const configOptions = {
    appName: "GoldPOS",

    logger: {
      disabled: !config.logsEnabled,
    },

    //#region Security config
    secret: config.secret,

    // https://www.better-auth.com/docs/concepts/session-management
    session: {
      // https://www.better-auth.com/docs/concepts/session-management#cookie-cache
      cookieCache: {
        enabled: true,
        maxAge: CACHED_COOKIE_MAX_AGE,
      },

      // https://www.better-auth.com/docs/concepts/session-management#session-expiration
      expiresIn: SESSION_EXPIRES_AFTER,
      updateAge: SESSION_UPDATE_AGE,

      // https://www.better-auth.com/docs/concepts/session-management#session-freshnes
      freshAge: SESSION_FRESH_AGE,

      storeSessionInDatabase: true,
      preserveSessionInDatabase: false,
    },
    user: {
      additionalFields: {
        phone: {
          type: "string",
          returned: true,
          input: true,
          validator: {
            input: z
              .string()
              .refine(
                (value) =>
                  value === undefined || /^\+[1-9]\d{1,14}$/.test(value),
                "Phone must be in E.164 format",
              ),
          },
        },
      },
    },
    advanced: {
      useSecureCookies: true,
      cookiePrefix: "auth",
    },
    //#endregion
    database,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
    },

    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: true,
    },

    // Prevent API errors from becoming unhandled promise rejections
    // by providing a handler. The error has already been logged by better-auth,
    // and converted to an HTTP response - we just need to prevent the re-throw.
    // Note: This handler only works for errors that reach the router's onError.
    // Some errors escape before reaching the router due to gaps in better-auth's
    // error handling. See the better-auth patch for the complete fix.
    onAPIError: {
      onError: () => {
        // Intentionally empty - errors are already logged and handled via HTTP response.
        // This callback prevents the error from being re-thrown as an unhandled rejection.
      },
    },

    plugins: [bearer(), customSessionPlugin(args), adminPlugin({ config })],
  } satisfies BetterAuthOptions;

  return configOptions;
};

const adminPlugin = (args: { config: AuthConfigEnvVar }) => {
  const superAdminUserIds = Object.seal(
    Object.values(args.config.superAdminUserIds ?? {}),
  );
  return admin({
    adminRoles: Object.seal([]), // This MUST be an empty array
    adminUserIds: superAdminUserIds,
    defaultRole: "user",
  });
};

const customSessionPlugin = (args: Args) => {
  return customSession(async ({ user, session }) => {
    const roles = await args.accessService.getUserRoles(user.id);
    return {
      user: { ...user, roles },
      session: session as typeof session & {},
    };
  });
};
