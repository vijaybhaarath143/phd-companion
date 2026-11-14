import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/sign-in", "/verify", "/api/health"];

/**
 * Runs before every request:
 *  1. refreshes the Supabase session and sends signed-out visitors to sign-in
 *     (an optimistic check only — pages, actions and the database all verify again);
 *  2. sets a strict Content Security Policy with a fresh nonce, so the browser
 *     only runs the app's own scripts.
 */
export async function proxy(request: NextRequest) {
  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) {
            request.cookies.set(c.name, c.value);
            pending.push(c);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  const withCookies = (res: NextResponse) => {
    for (const c of pending) res.cookies.set(c.name, c.value, c.options);
    return res;
  };

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return withCookies(NextResponse.redirect(url));
  }
  if (signedIn && (path === "/sign-in" || path === "/verify")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withCookies(NextResponse.redirect(url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, request.nextUrl.protocol === "https:");
  const headers = new Headers(request.headers); // includes any refreshed session cookie
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp); // Next.js reads this to add the nonce to its scripts

  const response = withCookies(NextResponse.next({ request: { headers } }));
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function contentSecurityPolicy(nonce: string, https: boolean) {
  const dev = process.env.NODE_ENV === "development";
  const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
  return [
    "default-src 'self'",
    // only scripts carrying this request's nonce (and what they load) may run
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // UI components set some inline styles; styles can't run code
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // uploads go straight from the browser to Supabase storage
    `connect-src 'self' ${supabase}${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // on the live (HTTPS) site, any stray http:// request is upgraded
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.*\\.png).*)"],
};
