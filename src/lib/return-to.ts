/**
 * Connecting ChatGPT or Codex sends her to the consent page. If she isn't signed in yet,
 * the proxy remembers that page in a short-lived cookie so the emailed sign-in link brings
 * her back to it. Only the consent page can be remembered (no open redirects).
 */
export const CONSENT_PATH = "/oauth/consent";
export const RETURN_TO_COOKIE = "after_sign_in";

export function safeReturnTo(value: string | undefined | null): string | null {
  if (!value) return null;
  return value === CONSENT_PATH || /^\/oauth\/consent\?authorization_id=[\w-]+$/.test(value) ? value : null;
}
