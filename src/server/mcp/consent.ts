import "server-only";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { withUser, type SessionUser } from "@/server/db";
import { classifyClient, splitRedirectUris, type ClientCheck } from "@/server/mcp/clients";

/**
 * What the consent page (and its Allow / Don't allow actions) needs to know about a
 * connection request: is it still open, has she approved this app before, and — judged by
 * where its sign-in returns to, not by its name — is it an app that may connect at all?
 * The actions call this again themselves; they never trust what the page showed.
 */
export type Review =
  | { state: "expired" }
  | { state: "approved"; redirectUrl: string; client: ClientCheck }
  | { state: "ask"; details: OAuthAuthorizationDetails; client: ClientCheck };

export async function reviewAuthorization(user: SessionUser, authorizationId: string): Promise<Review> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return { state: "expired" };
  // Already approved before: Supabase has issued the code; judge where it would go.
  if (!("authorization_id" in data)) return { state: "approved", redirectUrl: data.redirect_url, client: classifyClient([data.redirect_url]) };
  const registered = await registeredRedirects(user, data.client.id);
  return { state: "ask", details: data, client: classifyClient([data.redirect_uri, ...registered], data.client.name) };
}

/**
 * Every redirect address the app registered (not just the one in this request), read through
 * the same database function that labels its records. Runs as her, naming only this app.
 * If it can't be read, the request's own redirect address is still checked.
 */
export async function registeredRedirects(user: SessionUser, clientId: string): Promise<string[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) return [];
  try {
    const [row] = await withUser({ id: user.id, email: user.email, clientId }, (tx) =>
      tx<{ uris: string | null }[]>`select app.connector_redirect() as uris`,
    );
    return splitRedirectUris(row?.uris);
  } catch {
    return [];
  }
}
