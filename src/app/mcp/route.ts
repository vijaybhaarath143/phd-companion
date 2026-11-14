import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerToken, ConnectorAuthError, connectorStatus, verifyAccessToken } from "@/server/mcp/auth";
import { createConnectorServer } from "@/server/mcp/server";
import { CORS, publicOrigin, unauthorized, withHeaders } from "@/server/mcp/http";

/**
 * The connector endpoint for ChatGPT and Codex (Model Context Protocol, Streamable HTTP).
 * Stateless: every request carries her access token, is checked, and runs as her —
 * all reads and writes go through withUser, so row-level security applies.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const origin = publicOrigin(req);
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return unauthorized(origin, "Sign in to PhD Companion to use this connector.");

  let user;
  try {
    user = await verifyAccessToken(token);
  } catch (e) {
    const message = e instanceof ConnectorAuthError ? e.message : "The sign-in for this connection isn't valid.";
    return unauthorized(origin, message, "invalid_token");
  }
  const status = await connectorStatus(user);
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

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
