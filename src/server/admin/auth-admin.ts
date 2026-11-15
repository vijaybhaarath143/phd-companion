import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { adminConfigured } from "@/server/admin/configured";

/**
 * Supabase's account API, with the secret key. The ONLY place in the web app that holds
 * it, and only src/server/actions/admin.ts may import this file (ESLint enforces it).
 * Every caller must first confirm in the database that the signed-in person is a
 * platform admin (app.require_platform_admin) — the key itself can do anything.
 */
let client: SupabaseClient | null = null;

export function authAdmin() {
  if (!adminConfigured()) throw new Error("SUPABASE_SECRET_KEY is not set");
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.auth.admin;
}
