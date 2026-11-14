import { CORS, publicOrigin, resourceMetadata } from "@/server/mcp/http";

/**
 * OAuth protected-resource metadata (RFC 9728) for the connector at /mcp: tells ChatGPT and
 * Codex that sign-in happens through this project's Supabase Auth. Served at
 * /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/mcp.
 */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return Response.json(resourceMetadata(publicOrigin(req)), { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
