export const AUTH_API_BASE_PATH = "/api/auth";

/**
 * https://www.better-auth.com/docs/concepts/session-management#cookie-cache
 */
export const CACHED_COOKIE_MAX_AGE = 60 * 30; // 30 minutes
export const COOKIE_CROSS_SUBDOMAIN_ENABLED = true;

/**
 * Some endpoints in Better Auth require the session to be fresh.
 * A session is considered fresh if its createdAt is within the freshAge limit
 *
 * https://www.better-auth.com/docs/concepts/session-management#session-freshness
 */
export const SESSION_FRESH_AGE = 60 * 60 * 4; // 4 hours

// https://www.better-auth.com/docs/concepts/session-management#session-expiration
export const SESSION_EXPIRES_AFTER = 60 * 60 * 24 * 7; // 7 days
export const SESSION_UPDATE_AGE = 60 * 60 * 24; // 1 day (every 1 day the session expiration is updated)

export const JWT_EXPIRES_AFTER: `${number}${"s" | "m" | "h"}` = "1h";

/**
 * The better-auth session cookie name, derived from:
 * `useSecureCookies: true` (__Secure- prefix) + `cookiePrefix: "auth"`
 */
export const SESSION_COOKIE_NAME = "__Secure-auth.session_token";
