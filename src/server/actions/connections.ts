"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";
import { fail, ok } from "@/lib/result";

/**
 * Approving or refusing a ChatGPT / Codex connection on /oauth/consent, and disconnecting one
 * in Settings. Supabase Auth's OAuth server does the work; these run with her own session.
 */

const ID = /^[\w-]{8,200}$/;

async function decide(form: FormData, approve: boolean) {
  await requireUser();
  const id = String(form.get("authorization_id") ?? "");
  if (!ID.test(id)) redirect("/oauth/consent");
  const supabase = await createSupabaseServer();
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}&expired=1`);
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
