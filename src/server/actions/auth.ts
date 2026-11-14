"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

const PENDING = "pending_sign_in";

export type AuthState = { error?: string; sent?: boolean } | undefined;

export async function sendCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email address." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) {
    return { error: "We couldn't send a code to that address. Check the spelling — this app is invite-only." };
  }
  // Keep the address out of the URL: a short-lived, http-only cookie carries it to the next step.
  (await cookies()).set(PENDING, email, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  redirect("/verify");
}

export async function verifyCode(_prev: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  const jar = await cookies();
  const email = jar.get(PENDING)?.value;
  if (!email) return { error: "Your code request expired. Go back and send a new code." };
  if (token.length !== 6) return { error: "Enter all 6 digits." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { error: "That code didn't work. Check it, or send a new one." };
  jar.delete(PENDING);
  redirect("/");
}

export async function resendCode(_prev?: AuthState): Promise<AuthState> {
  const email = (await cookies()).get(PENDING)?.value;
  if (!email) return { error: "Your code request expired. Go back and enter your email again." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return { error: "Please wait a moment before asking for another code." };
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
