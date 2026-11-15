/**
 * Password and username rules, shared by the forms and the server.
 * Supabase enforces the same password rule (supabase/config.toml → [auth]).
 */
export const PASSWORD_MIN = 10;
/** Supabase stores passwords with bcrypt, which takes at most 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return "That password is too long. Use a shorter one.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use both letters and numbers.";
  return null;
}

export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const USERNAME_HINT = "3–32 characters: lower-case letters, numbers, dots, dashes or underscores.";

export function normaliseUsername(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Accounts made with only a username get an address that can never receive email. */
export const PLACEHOLDER_EMAIL_DOMAIN = "users.invalid";
export const isPlaceholderEmail = (email: string | null | undefined) => !!email && email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
