import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AuthUnavailableError, bearerToken, ConnectorAuthError, connectorStatus, verifyAccessToken } from "@/server/mcp/auth";
import { createConnectorServer } from "@/server/mcp/server";
import { AccountSuspendedError } from "@/server/db";
import { CORS, methodNotAllowed, publicOrigin, unauthorized, unavailable, withHeaders } from "@/server/mcp/http";

/**
 * The connector endpoint for ChatGPT and Codex (Model Context Protocol, Streamable HTTP).
 * Stateless: every request carries her access token, is checked, and runs as her —
 * all reads and writes go through withUser, so row-level security applies.
 *
 * Only POST is served. GET (an event stream) and DELETE (ending a session) answer 405 at once,
 * before any token check, so a client that probes for a stream stops instead of reconnecting.
 * If Supabase Auth or the database is briefly down, the answer is 503 (try again), not 401.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const origin = publicOrigin(req);
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return unauthorized(origin, "Sign in to PhD Companion to use this connector.");

  let user;
  try {
    user = await verifyAccessToken(token);
  } catch (e) {
    if (e instanceof AuthUnavailableError) return unavailable(e.message);
    const message = e instanceof ConnectorAuthError ? e.message : "The sign-in for this connection isn't valid.";
    return unauthorized(origin, message, "invalid_token");
  }
  let status;
  try {
    status = await connectorStatus(user);
  } catch (e) {
    if (e instanceof AccountSuspendedError) return unauthorized(origin, "This PhD Companion account is suspended.", "invalid_token");
    return unavailable("PhD Companion's database couldn't be reached just now. Try again in a moment.");
  }
  if (!status.active) {
    return unauthorized(origin, "This connection was disconnected in PhD Companion. Connect again to continue.", "invalid_token");
  }

  const server = createConnectorServer({ user, token, origin });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return withHeaders(await transport.handleRequest(req));
  } finally {
    void server.close();
  }
}

export function GET() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
