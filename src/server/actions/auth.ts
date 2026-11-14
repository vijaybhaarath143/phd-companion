"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { signInMode } from "@/lib/sign-in-mode";
import { RETURN_TO_COOKIE, safeReturnTo } from "@/lib/return-to";

const PENDING = "pending_sign_in";

export type AuthState = { error?: string; sent?: boolean } | undefined;

/** Where the emailed sign-in link brings her back to (this site's /auth/confirm). */
async function confirmUrl() {
  const h = await headers();
  const origin = h.get("origin") ?? (h.get("host") ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}` : "");
  return `${origin}/auth/confirm`;
}

async function send(email: string) {
  const supabase = await createSupabaseServer();
  // Invite-only: never creates an account. In "link" mode the email holds a sign-in link
  // back to /auth/confirm; in "code" mode (custom email template) it holds a 6-digit code.
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: await confirmUrl() },
  });
}

export async function sendCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email address." };

  const { error } = await send(email);
  if (error) {
    if (error.status === 429) return { error: "Too many requests — please wait a minute and try again." };
    return { error: `We couldn't send a sign-in email to that address. Check the spelling — this app is invite-only.` };
  }
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
  const { error } = await send(email);
  if (error) return { error: "Please wait a minute before asking for another email." };
  return { sent: true };
}

export async function pendingEmail() {
  return (await cookies()).get(PENDING)?.value ?? null;
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
