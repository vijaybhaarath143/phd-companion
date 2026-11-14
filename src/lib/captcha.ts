/**
 * Optional Cloudflare Turnstile check on the sign-in form, so nobody can script sign-in
 * emails to her address and use up the project's small hourly email quota.
 * Off unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; Supabase must also have CAPTCHA
 * protection turned on with the matching secret (Authentication → Attack Protection).
 */
export function captchaSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;
}

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
