import { betterAuth } from "better-auth";
import { getDb } from "./db";
import { parseAuthConfigFromEnv } from "./get-env";
import { getAuthOptions } from "./auth.config";
import { AccessService } from "@/services/access/access.service";

// Lazy singleton — defers getCloudflareContext() until first request, not module load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;

function getInstance() {
  if (!_auth) {
    _auth = betterAuth(
      getAuthOptions({
        db: getDb(),
        config: parseAuthConfigFromEnv(),
        accessService: new AccessService(getDb()),
      }),
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return _auth;
}

export const auth: ReturnType<typeof betterAuth> = new Proxy(
  {} as ReturnType<typeof betterAuth>,
  {
    get(_, prop: PropertyKey) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return getInstance()[prop as string];
    },
    has(_, prop: PropertyKey) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return prop in getInstance();
    },
  },
);
