import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { withUser, type SessionUser, type Tx } from "@/server/db";

/** Superuser connection for test setup/cleanup only — app code never uses this. */
export const admin = postgres(process.env.DATABASE_URL!, { max: 2, transform: postgres.camel });
const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

/** Create a throwaway account; returns a SessionUser for withUser(). */
export async function makeUser(label: string): Promise<SessionUser> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const { data, error } = await auth.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, email };
}

export async function dropUser(u: SessionUser) {
  await auth.auth.admin.deleteUser(u.id);
}

/** Run as a user and expect the database to refuse; returns the error message. */
export async function refused(u: SessionUser, fn: (tx: Tx) => Promise<unknown>): Promise<string> {
  try {
    await withUser(u, fn);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("Expected the database to refuse this, but it was allowed");
}

export { withUser };
