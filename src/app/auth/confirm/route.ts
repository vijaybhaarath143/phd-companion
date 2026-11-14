import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Where the emailed sign-in link lands. Supabase sends either a one-time `code`
 * (default email, PKCE flow — must be the same browser that asked) or a
 * `token_hash` (custom template). Either way we turn it into a session cookie.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "email") as EmailOtpType;

  const supabase = await createSupabaseServer();
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  const to = request.nextUrl.clone();
  to.search = "";
  if (ok) {
    to.pathname = "/";
    const res = NextResponse.redirect(to);
    res.cookies.delete("pending_sign_in");
    return res;
  }
  to.pathname = "/sign-in";
  to.searchParams.set("error", "link");
  return NextResponse.redirect(to);
}
