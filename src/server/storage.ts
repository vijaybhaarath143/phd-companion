import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { withUser, type SessionUser } from "@/server/db";

export const EVIDENCE_BUCKET = "evidence";

/**
 * Her private file storage, reached with her own access token (so storage's folder rules
 * apply). Read the token while the request is still running; the returned client can then
 * be used after the response has started (streamed export, after()).
 */
export async function storageAsUser() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return storageWithToken(token);
}

export function storageWithToken(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  }).storage.from(EVIDENCE_BUCKET);
}

type Bucket = ReturnType<typeof storageWithToken>;

/**
 * Remove stored files that are no longer evidence: uploads that failed or were abandoned,
 * and files of records purged from Trash. The database queues them (app.storage_removals)
 * and only lets these — never verified evidence — be removed. Runs quietly in the
 * background after a page is sent; a few at a time.
 */
export async function removeQueuedFiles(user: SessionUser, bucket: Bucket) {
  try {
    const paths = await withUser(user, (tx) => tx<{ path: string }[]>`select app.my_storage_removals(50) as path`);
    if (!paths.length) return;
    const list = paths.map((p) => p.path);
    const { data, error } = await bucket.remove(list);
    if (error) {
      console.error("storage clean-up failed:", error.message);
      return;
    }
    // Storage reports what it removed; paths it doesn't report were already gone (an upload
    // that never arrived) or were refused. Both are forgotten once they've been queued a while.
    const removed = new Set((data ?? []).map((o) => o.name));
    await withUser(user, (tx) => tx`
      select app.forget_storage_removals(${list.filter((p) => removed.has(p))}::text[])`);
    await withUser(user, (tx) => tx`select app.forget_stale_storage_removals()`);
  } catch (e) {
    console.error("storage clean-up failed:", (e as Error).message);
  }
}
