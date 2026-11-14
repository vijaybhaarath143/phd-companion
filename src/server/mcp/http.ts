import "server-only";
import { authIssuer } from "@/server/mcp/auth";

/** This site's public address as the caller sees it (Vercel and local dev both set these headers). */
export function publicOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const MCP_PATH = "/mcp";

/** Where clients find out how to sign in for the connector (RFC 9728). */
export function resourceMetadataUrl(origin: string) {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

export function resourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [authIssuer()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "PhD Companion",
    resource_documentation: `${origin}/settings`,
  };
}

/**
 * Scopes asked for at sign-in. They don't narrow access: what she can see is decided by
 * row-level security. ("openid" is left out: no ID token is needed, and Supabase can only
 * issue one when the project signs tokens with asymmetric keys.)
 */
export const SCOPES = ["email", "profile"];

/**
 * Bearer tokens (not cookies) carry the sign-in, so any origin may call the endpoint;
 * this is what lets browser-based tools such as the MCP Inspector reach it.
 */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function withHeaders(res: Response, extra: Record<string, string> = {}) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...CORS, "Cache-Control": "no-store", ...extra })) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** JSON-RPC error body (no request id: the request wasn't read). */
function rpcError(status: number, code: number, message: string, extra: Record<string, string> = {}) {
  return withHeaders(Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status }), extra);
}

/**
 * GET (a server-to-client event stream) and DELETE (ending a session) aren't offered: the
 * endpoint is stateless. A plain 405 tells MCP clients not to keep reopening a stream.
 */
export function methodNotAllowed() {
  return rpcError(405, -32000, "Method not allowed. Send MCP requests with POST.", { Allow: "POST" });
}

/** Supabase Auth or the database is briefly unavailable: try again, the sign-in is still fine. */
export function unavailable(message = "PhD Companion couldn't check this sign-in just now. Try again in a moment.") {
  return rpcError(503, -32002, message, { "Retry-After": "30" });
}

/** 401 that tells ChatGPT / Codex where to sign in (RFC 6750 + RFC 9728). */
export function unauthorized(origin: string, description: string, error: "invalid_token" | null = null) {
  const params = [
    error ? `error="${error}"` : null,
    error ? `error_description="${description.replace(/"/g, "'")}"` : null,
    `resource_metadata="${resourceMetadataUrl(origin)}"`,
    `scope="${SCOPES.join(" ")}"`,
  ].filter(Boolean);
  return withHeaders(
    Response.json({ jsonrpc: "2.0", error: { code: -32001, message: description }, id: null }, { status: 401 }),
    { "WWW-Authenticate": `Bearer ${params.join(", ")}` },
  );
}
