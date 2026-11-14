"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { signInMode } from "@/lib/sign-in-mode";
import { RETURN_TO_COOKIE, safeReturnTo } from "@/lib/return-to";
import { captchaSiteKey } from "@/lib/captcha";

const PENDING = "pending_sign_in";

export type AuthState = { error?: string; sent?: boolean } | undefined;

/** Where the emailed sign-in link brings her back to (this site's /auth/confirm). */
async function confirmUrl() {
  const h = await headers();
  const origin = h.get("origin") ?? (h.get("host") ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}` : "");
  return `${origin}/auth/confirm`;
}

async function send(email: string, captchaToken?: string) {
  const supabase = await createSupabaseServer();
  // Invite-only: never creates an account. In "link" mode the email holds a sign-in link
  // back to /auth/confirm; in "code" mode (custom email template) it holds a 6-digit code.
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: await confirmUrl(), ...(captchaToken ? { captchaToken } : {}) },
  });
}

/**
 * Turn Supabase's answer into what she sees. An address without an account gets the same
 * "check your email" as one with an account, so the form can't be used to find out who
 * has one. Only real trouble (rate limit, CAPTCHA, the email service down) is shown.
 */
function sendProblem(error: { status?: number; code?: string; message?: string } | null): string | null {
  if (!error) return null;
  if (error.status === 429) return "Too many requests — please wait a minute and try again.";
  if (error.code === "captcha_failed" || /captcha/i.test(error.message ?? "")) return "Please complete the check below and try again.";
  if ((error.status ?? 500) >= 500) {
    console.error("sign-in email failed:", error.status, error.code ?? "", error.message ?? "");
    return "We couldn't send the email just now. Please try again in a few minutes.";
  }
  return null; // e.g. no account for this address: answer as if sent
}

export async function sendCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { error: "Please enter a valid email address." };
  const captcha = String(form.get("cf-turnstile-response") ?? "") || undefined;

  const { error } = await send(email, captcha);
  const problem = sendProblem(error);
  if (problem) return { error: problem };
  // Keep the address out of the URL: a short-lived, http-only cookie carries it to the next step.
  (await cookies()).set(PENDING, email, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  redirect("/verify");
}

export async function verifyCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (signInMode() !== "code") return { error: "Use the link in the email to sign in." };
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  const jar = await cookies();
  const email = jar.get(PENDING)?.value;
  if (!email) return { error: "Your code request expired. Go back and send a new code." };
  if (token.length !== 6) return { error: "Enter all 6 digits." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { error: "That code didn't work. Check it, or send a new one." };
  jar.delete(PENDING);
  const returnTo = safeReturnTo(jar.get(RETURN_TO_COOKIE)?.value);
  jar.delete(RETURN_TO_COOKIE);
  redirect(returnTo ?? "/");
}

export async function resendCode(_prev?: AuthState): Promise<AuthState> {
  const email = (await cookies()).get(PENDING)?.value;
  if (!email) return { error: "This sign-in request expired. Go back and enter your email again." };
  // With CAPTCHA turned on, a new email needs a fresh check on the sign-in page.
  if (captchaSiteKey()) return { error: "To get a new email, go back and enter your email again." };
  const problem = sendProblem((await send(email)).error);
  if (problem) return { error: problem.startsWith("Too many") ? "Please wait a minute before asking for another email." : problem };
  return { sent: true };
}

export async function pendingEmail() {
  return (await cookies()).get(PENDING)?.value ?? null;
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  // This device only: her other devices and connected assistants stay signed in.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}
