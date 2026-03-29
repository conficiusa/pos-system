/**
 * Better Auth CLI configuration file
 *
 * Docs: https://www.better-auth.com/docs/concepts/cli
 */

import { betterAuth } from "better-auth";
import { DB } from "./src/lib/db";
import { getAuthOptions } from "@/lib/auth.config";
import { AuthConfigEnvVar } from "@/lib/get-env";

// When running better-auth CLI (whether locally or in CI environment), we use a fake D1 database instance ...
// ... since we don't have a real D1 database outside of a Cloudflare Workers runtime context.
const fakeDb = Object.create(null) as unknown as DB;
const fakeAuthConfig = Object.create({}) as AuthConfigEnvVar; // No auth config for CLI invocation

const authConfig = getAuthOptions({
  db: fakeDb,

  config: {
    ...fakeAuthConfig,
    secret: "this-is-a-fake-secret-only-used-for-cli-invocation",
  },
});
export const auth = betterAuth(authConfig);
