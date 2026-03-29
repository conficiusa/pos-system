import { betterAuth } from "better-auth";
import { getDb } from "./db";
import { parseAuthConfigFromEnv } from "./get-env";
import { getAuthOptions } from "./auth.config";
import { AccessService } from "@/services/access/access.service";

// Named factory so TypeScript can derive the full plugin-aware return type via
// ReturnType<typeof createAuth> — using ReturnType<typeof betterAuth> instead
// would give the base type with no plugin inference (roles etc. would be missing).
function createAuth() {
  return betterAuth(
    getAuthOptions({
      db: getDb(),
      config: parseAuthConfigFromEnv(),
      accessService: new AccessService(getDb()),
    }),
  );
}

// Lazy singleton — defers getCloudflareContext() until first request, not module load
let _auth: ReturnType<typeof createAuth> | null = null;

function getInstance(): ReturnType<typeof createAuth> {
  if (!_auth) {
    _auth = createAuth();
  }
  return _auth;
}

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_, prop: PropertyKey) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any
    return (getInstance() as any)[prop as string];
  },
  has(_, prop: PropertyKey) {
    return prop in getInstance();
  },
});

export type Auth = typeof auth;
