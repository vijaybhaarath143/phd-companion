import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { withUser, type SessionUser, type Tx } from "@/server/db";

/** The verified signed-in user, or a redirect to sign-in. Cached per request. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/sign-in");
  return { id: claims.sub, email: String(claims.email ?? "") };
});

/** Run database work as the signed-in user (row-level security applies). */
export async function asUser<T>(fn: (tx: Tx, user: SessionUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return withUser(user, (tx) => fn(tx, user));
}
