import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/** A suspended account lands here: sign this device out and explain on the sign-in page. */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut({ scope: "local" });
  const to = new URL("/sign-in", request.nextUrl.origin);
  to.searchParams.set("error", "suspended");
  return NextResponse.redirect(to);
}
