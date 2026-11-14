/**
 * How the sign-in email works:
 *  - "link" (default): Supabase's built-in email with a sign-in link — works on the free tier.
 *    The link must be opened on the same device and browser that asked for it.
 *  - "code": a 6-digit code — needs your own email service (custom SMTP) so the
 *    code template in supabase/templates can be used. Works from any device.
 */
export function signInMode(): "link" | "code" {
  return process.env.SIGN_IN_MODE === "code" ? "code" : "link";
}
