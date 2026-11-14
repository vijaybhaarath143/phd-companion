/**
 * Is this a normal signed-in session for the website?
 *
 * Tokens issued to a connected assistant (ChatGPT, Codex) carry a `client_id`. They are
 * accepted only by the connector at /mcp, which also checks the connection still exists;
 * everywhere else (pages, actions, export, files) they are refused, so a leaked assistant
 * token can't download everything or act through the website.
 */
export function isBrowserSession(claims: Record<string, unknown> | null | undefined): claims is { sub: string; email?: string } & Record<string, unknown> {
  if (!claims || typeof claims.sub !== "string" || !claims.sub) return false;
  if (claims.role !== undefined && claims.role !== "authenticated") return false;
  if (claims.is_anonymous === true) return false;
  if (typeof claims.client_id === "string" && claims.client_id !== "") return false;
  return true;
}
