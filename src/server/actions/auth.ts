"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { signInMode } from "@/lib/sign-in-mode";
import { RETURN_TO_COOKIE, safeReturnTo } from "@/lib/return-to";
import { captchaSiteKey } from "@/lib/captcha";
import { createHash } from "node:crypto";
import { AccountSuspendedError, loginEmailFor, signInLimits, withUser } from "@/server/db";
import { asUser, requireUser } from "@/server/auth";
import { normaliseUsername, passwordProblem, PLACEHOLDER_EMAIL_DOMAIN, USERNAME_RULE } from "@/lib/passwords";

const PENDING = "pending_sign_in";

export type AuthState = { error?: string; sent?: boolean; identifier?: string } | undefined;

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

const WRONG = "Username or password is incorrect.";
const TOO_MANY = "Too many attempts. Wait 15 minutes and try again — or sign in with Email link if your account has an email address.";

/** The sign-in form: one form (and one CAPTCHA check) for both ways of signing in. */
export async function signIn(prev: AuthState, form: FormData): Promise<AuthState> {
  if (form.get("method") !== "password") return sendCode(prev, form);
  const id = String(form.get("identifier") ?? "").trim();
  const state = await passwordSignIn(id, form);
  // keep the username in the box (the form is cleared after each try)
  return state && { ...state, identifier: id.slice(0, 254) };
}

const hashKey = (kind: string, value: string) => createHash("sha256").update(`${kind}:${value}`).digest("hex");

/** The visitor's address as the host reports it (Vercel sets x-forwarded-for itself). */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
  return ip ? ip.slice(0, 64) : null;
}

/**
 * Sign in with a username (or email) and password. Every kind of failure — no such
 * username, wrong password, suspended account — gets the same answer, so the form can't
 * be used to find out who has an account. Repeated failures for one account or from one
 * address are paused for 15 minutes.
 */
async function passwordSignIn(id: string, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (!id || !password) return { error: "Enter your username and password." };
  if (id.length > 254 || password.length > 200) return { error: WRONG };
  const captchaToken = String(form.get("cf-turnstile-response") ?? "") || undefined;

  let email: string | null;
  if (id.includes("@")) email = id.toLowerCase();
  else {
    const username = normaliseUsername(id);
    email = USERNAME_RULE.test(username) ? await loginEmailFor(username) : null;
  }
  const accountKey = hashKey("account", email ?? normaliseUsername(id));
  const ip = await clientIp();
  const ipKey = ip ? hashKey("ip", ip) : null;
  if (await signInLimits.blocked(accountKey, ipKey)) return { error: TOO_MANY };

  // An unknown username still asks Supabase (with an address that has no account),
  // so it takes as long as a wrong password.
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email ?? `no-account-${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  });
  if (error || !data.user) {
    if (error?.status === 429) return { error: "Too many attempts — please wait a few minutes and try again." };
    if (error?.code === "captcha_failed" || /captcha/i.test(error?.message ?? "")) return { error: "Please complete the check below and try again." };
    if ((error?.status ?? 500) >= 500) {
      console.error("password sign-in failed:", error?.status, error?.code ?? "", error?.message ?? "");
      return { error: "We couldn't sign you in just now. Please try again in a few minutes." };
    }
    await signInLimits.failed(accountKey, ipKey);
    return { error: WRONG };
  }

  let mustChange = false;
  try {
    mustChange = await withUser({ id: data.user.id, email: data.user.email ?? "" }, async (tx) => {
      const [p] = await tx<{ mustChangePassword: boolean }[]>`select must_change_password from public.profiles where user_id = auth.uid()`;
      return p?.mustChangePassword ?? false;
    });
  } catch (e) {
    if (e instanceof AccountSuspendedError) {
      await supabase.auth.signOut({ scope: "local" });
      return { error: WRONG };
    }
    throw e;
  }
  await signInLimits.succeeded(accountKey);
  if (mustChange) redirect("/change-password"); // the return-to cookie waits until after
  await goOn();
}

/** After signing in: back to the ChatGPT / Codex consent page if that's where she was going. */
async function goOn(): Promise<never> {
  const jar = await cookies();
  const returnTo = safeReturnTo(jar.get(RETURN_TO_COOKIE)?.value);
  jar.delete(RETURN_TO_COOKIE);
  redirect(returnTo ?? "/");
}

export type PasswordState = { error?: string; done?: boolean } | undefined;

/** Choose a new password: at first sign-in (after the admin set one), or from Settings. */
export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  await requireUser();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from the one you have now." };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer one." };
    if (error.status === 429) return { error: "Too many attempts — please wait a few minutes and try again." };
    if (error.code === "reauthentication_needed") return { error: "For your security, sign out and sign in again, then change your password." };
    console.error("password change failed:", error.status, error.code ?? "", error.message ?? "");
    return { error: "Couldn't change your password just now. Please try again." };
  }
  const wasForced = await asUser(async (tx) => {
    const [row] = await tx<{ userId: string }[]>`
      update public.profiles set must_change_password = false
      where user_id = auth.uid() and must_change_password returning user_id`;
    return Boolean(row);
  });
  if (String(form.get("next") ?? "") === "home" || wasForced) await goOn();
  return { done: true };
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  // This device only: her other devices and connected assistants stay signed in.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in");
}
