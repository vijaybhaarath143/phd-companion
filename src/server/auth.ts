import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isBrowserSession } from "@/lib/session-claims";
import { withUser, type SessionUser, type Tx } from "@/server/db";

/** The verified signed-in user (website session only), or null. Cached per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!isBrowserSession(claims)) return null;
  return { id: claims.sub, email: String(claims.email ?? "") };
});

/** The verified signed-in user, or a redirect to sign-in. Cached per request. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
});

/** Run database work as the signed-in user (row-level security applies). */
export async function asUser<T>(fn: (tx: Tx, user: SessionUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user, (tx) => fn(tx, user));
}
