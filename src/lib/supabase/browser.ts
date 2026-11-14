"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser client — used only to send an upload to a one-time signed link. It needs no
 * session (the link itself is the permission), and the session cookies are http-only.
 */
let client: ReturnType<typeof createClient> | null = null;
export function supabaseBrowser() {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
