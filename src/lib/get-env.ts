export interface AuthConfigEnvVar {
  logsEnabled: boolean;
  superAdminUserIds?: Record<string, string>;
  secret: string;
  trustedOrigins?: string[];
  crossSubDomainCookiesEnabled?: boolean;
  cookieDomain?: string;
}

export interface MemcacheConfigEnvVar {
  metricsEnabled: boolean;
}

export const parseAuthConfigFromEnv = (): Readonly<AuthConfigEnvVar> => {
  if (typeof process.env.AUTH_CONFIG !== "string") {
    return undefined as unknown as Readonly<AuthConfigEnvVar>;
  }
  const parsedEnv = JSON.parse(process.env.AUTH_CONFIG) as AuthConfigEnvVar;
  return Object.seal({ ...parsedEnv, secret: process.env.AUTH_SECRET ?? "" });
};
