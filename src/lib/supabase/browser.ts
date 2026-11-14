"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client — used only to send an upload to a one-time signed link. */
export function supabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
