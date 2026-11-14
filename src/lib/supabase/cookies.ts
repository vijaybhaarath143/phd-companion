import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Session cookies are http-only: page scripts never need them (data goes through the
 * server, and uploads use one-time links), so a script injected into a page can't read
 * the session. HTTPS-only on the live site comes from HSTS.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
};
