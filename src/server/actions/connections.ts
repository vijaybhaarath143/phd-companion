"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { reviewAuthorization } from "@/server/mcp/consent";
import { fail, ok } from "@/lib/result";

/**
 * Approving or refusing a ChatGPT / Codex connection on /oauth/consent, and disconnecting one
 * in Settings. Supabase Auth's OAuth server does the work; these run with her own session.
 */

const ID = /^[\w-]{8,200}$/;

async function decide(form: FormData, approve: boolean) {
  const user = await requireUser();
  const id = String(form.get("authorization_id") ?? "");
  if (!ID.test(id)) redirect("/oauth/consent");
  const consentPage = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;

  // Check again here — never trust what the page showed. Only ChatGPT (chatgpt.com / openai.com)
  // and apps on her own computer (Codex) can be approved, judged by where the sign-in returns to.
  const review = await reviewAuthorization(user, id);
  if (review.state === "expired") redirect(`${consentPage}&expired=1`);
  if (review.state === "approved") {
    // Already approved before; Supabase has the answer ready. Only ever go back to an allowed app.
    redirect(review.client.allowed ? review.redirectUrl : "/oauth/consent?refused=1");
  }
  if (approve && !review.client.allowed) redirect(consentPage);

  const supabase = await createSupabaseServer();
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect(`${consentPage}&expired=1`);
  // Refusing an app that isn't allowed: close the request, but don't send her to its address.
  if (!review.client.allowed) redirect("/oauth/consent?refused=1");
  // Back to ChatGPT / Codex, carrying the one-time code (or the refusal).
  redirect(data.redirect_url);
}

export async function approveConnection(form: FormData) {
  await decide(form, true);
}

export async function denyConnection(form: FormData) {
  await decide(form, false);
}

export async function disconnectApp(clientId: string) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return fail("validation", "Something went wrong — please try again.");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) return fail("retry", "Couldn't disconnect just now. Try again.");
  refresh();
  return ok(undefined);
}
