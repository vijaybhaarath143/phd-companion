import "server-only";
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { withUser, type SessionUser } from "@/server/db";

/**
 * Who is calling the connector. ChatGPT and Codex get an access token from Supabase Auth's
 * OAuth 2.1 server after she signs in and approves them on /oauth/consent. The token is a
 * normal Supabase token for her account, plus `client_id` (which app) and `session_id`.
 */
export type ConnectorUser = Required<Pick<SessionUser, "id" | "email" | "clientId" | "sessionId">>;

export class ConnectorAuthError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The token from an `Authorization: Bearer …` header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** The OAuth issuer for this project, e.g. https://<ref>.supabase.co/auth/v1 */
export function authIssuer(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!) {
  return `${new URL(supabaseUrl).origin}/auth/v1`;
}

let remoteKeys: JWTVerifyGetKey | null = null;
function projectKeys() {
  remoteKeys ??= createRemoteJWKSet(new URL(`${authIssuer()}/.well-known/jwks.json`), { cacheMaxAge: 10 * 60 * 1000 });
  return remoteKeys;
}

/**
 * Projects still on the older shared-secret (HS256) signing can't be checked with public keys;
 * ask Supabase Auth itself whether the token is valid instead.
 */
async function verifyWithAuthServer(token: string): Promise<JWTPayload> {
  const res = await fetch(`${authIssuer()}/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    cache: "no-store",
  });
  if (!res.ok) throw new ConnectorAuthError("The sign-in for this connection has expired or isn't valid.");
  return decodeJwt(token);
}

type VerifyOptions = {
  /** Public keys to check the signature with (default: the project's published keys). */
  keys?: JWTVerifyGetKey;
  issuer?: string;
  /** Used for HS256-signed tokens (default: ask Supabase Auth). */
  verifyRemotely?: (token: string) => Promise<JWTPayload>;
};

/**
 * Check an access token and return who it belongs to. Only tokens issued to a connected
 * app (they carry `client_id`) are accepted — a browser session token is not.
 */
export async function verifyAccessToken(token: string, opts: VerifyOptions = {}): Promise<ConnectorUser> {
  const issuer = opts.issuer ?? authIssuer();
  let payload: JWTPayload;
  try {
    const { alg } = decodeProtectedHeader(token);
    if (alg === "HS256") {
      payload = await (opts.verifyRemotely ?? verifyWithAuthServer)(token);
      if (payload.iss !== issuer || payload.aud !== "authenticated" || !payload.exp || payload.exp * 1000 < Date.now()) {
        throw new ConnectorAuthError("This token wasn't issued for PhD Companion.");
      }
    } else {
      ({ payload } = await jwtVerify(token, opts.keys ?? projectKeys(), {
        issuer,
        audience: "authenticated",
        algorithms: ["ES256", "RS256", "EdDSA"],
        requiredClaims: ["sub", "exp"],
        clockTolerance: 30,
      }));
    }
  } catch (e) {
    if (e instanceof ConnectorAuthError) throw e;
    throw new ConnectorAuthError("The sign-in for this connection has expired or isn't valid.");
  }

  const claims = payload as JWTPayload & { role?: unknown; email?: unknown; client_id?: unknown; session_id?: unknown; is_anonymous?: unknown };
  if (claims.role !== "authenticated" || claims.is_anonymous === true || typeof claims.sub !== "string" || !UUID.test(claims.sub)) {
    throw new ConnectorAuthError("This token isn't for a signed-in account.");
  }
  if (typeof claims.client_id !== "string" || !UUID.test(claims.client_id)) {
    throw new ConnectorAuthError("Connect through ChatGPT or Codex — this token wasn't issued to a connected app.");
  }
  if (typeof claims.session_id !== "string" || !UUID.test(claims.session_id)) {
    throw new ConnectorAuthError("This token has no sign-in session.");
  }
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    clientId: claims.client_id,
    sessionId: claims.session_id,
  };
}

/**
 * Is the connection still approved (not disconnected in Settings), and which app is it?
 * Runs as the user, so it can only ever look at her own session.
 */
export async function connectorStatus(user: ConnectorUser): Promise<{ active: boolean; source: string }> {
  const [row] = await withUser(user, (tx) =>
    tx<{ active: boolean; source: string }[]>`select app.connector_session_ok() as active, app.request_source() as source`,
  );
  return row ?? { active: false, source: "mcp" };
}
