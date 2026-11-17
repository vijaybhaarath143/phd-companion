import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { ChatGPTError, connectionConfig, ISSUER, RESOURCE, SCOPES } from "./config";
import { digest, randomValue } from "./crypto";

export type PendingAuthorization = {
  verifier: string; nonce: string; redirectUri: string; clientId: string; subject: string | null;
};
export type Credentials = { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] };
const metadataSchema = z.object({ issuer: z.literal(ISSUER), authorization_endpoint: z.url(), token_endpoint: z.url(), jwks_uri: z.url(), revocation_endpoint: z.url().optional() });
let discovery: { expires: number; metadata: z.infer<typeof metadataSchema> } | undefined;
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function metadata() {
  if (discovery && discovery.expires > Date.now()) return discovery.metadata;
  const response = await fetch(`${ISSUER}/.well-known/openid-configuration`, { cache: "no-store", signal: AbortSignal.timeout(10_000), redirect: "error" });
  if (!response.ok) throw new ChatGPTError("retry");
  const data = metadataSchema.parse(await response.json());
  for (const endpoint of [data.authorization_endpoint, data.token_endpoint, data.jwks_uri, data.revocation_endpoint].filter(Boolean)) {
    if (new URL(endpoint!).origin !== ISSUER) throw new ChatGPTError("retry");
  }
  discovery = { metadata: data, expires: Date.now() + 3_600_000 };
  return data;
}

export async function authorization(subject: string | null) {
  const config = connectionConfig();
  const state = randomValue();
  const pending: PendingAuthorization = { verifier: randomValue(), nonce: randomValue(), redirectUri: config.redirectUri, clientId: config.clientId, subject };
  const url = new URL((await metadata()).authorization_endpoint);
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: pending.redirectUri,
    response_type: "code", scope: SCOPES, resource: RESOURCE, state, nonce: pending.nonce,
    code_challenge: digest(pending.verifier), code_challenge_method: "S256" }).toString();
  return { url: url.toString(), state, pending };
}

function clientAuthentication(): Record<string, string> {
  const config = connectionConfig(false);
  if (config.method === "none") return {};
  const encode = (v: string) => new URLSearchParams({ v }).toString().slice(2);
  return { authorization: `Basic ${Buffer.from(`${encode(config.clientId)}:${encode(config.clientSecret!)}`).toString("base64")}` };
}

const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(),
  token_type: z.string().refine(v => v.toLowerCase() === "bearer"), expires_in: z.number().int().positive().max(31_536_000),
  scope: z.string().optional(), id_token: z.string().optional() });

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch((await metadata()).token_endpoint, { method: "POST", redirect: "error", cache: "no-store",
    signal: AbortSignal.timeout(12_000), headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...clientAuthentication() }, body });
  if (!response.ok) {
    // Never propagate the provider body: it can contain token/request details.
    if (response.status >= 500 || response.status === 429) throw new ChatGPTError("retry");
    throw new ChatGPTError("reconnect_required");
  }
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) throw new ChatGPTError("reconnect_required");
  return parsed.data;
}

function credentials(tokens: z.infer<typeof tokenSchema>, previous?: Credentials): Credentials {
  const scopes = tokens.scope === undefined ? previous?.scopes ?? [] : tokens.scope.split(/\s+/).filter(Boolean);
  if (!scopes.includes("chatgpt.tokens.use.direct") || !scopes.includes("resource.invoke")) throw new ChatGPTError("plan_required");
  const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new ChatGPTError("reconnect_required");
  return { accessToken: tokens.access_token, refreshToken, scopes, expiresAt: Date.now() + tokens.expires_in * 1000 };
}

export async function verifyIdentity(idToken: string, pending: PendingAuthorization): Promise<JWTPayload> {
  const info = await metadata();
  let keys = jwks.get(info.jwks_uri);
  if (!keys) { keys = createRemoteJWKSet(new URL(info.jwks_uri)); jwks.set(info.jwks_uri, keys); }
  const { payload } = await jwtVerify(idToken, keys, { issuer: info.issuer, audience: pending.clientId,
    requiredClaims: ["sub", "exp", "iat"], algorithms: ["RS256", "ES256"], clockTolerance: 5 });
  if ((payload.azp !== undefined && payload.azp !== pending.clientId) ||
      (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== pending.clientId)) throw new ChatGPTError("invalid_callback");
  if (payload.nonce !== pending.nonce || !payload.sub?.trim() || (pending.subject && pending.subject !== payload.sub)) throw new ChatGPTError("invalid_callback");
  return payload;
}

export async function exchange(code: string, pending: PendingAuthorization) {
  const config = connectionConfig();
  if (pending.clientId !== config.clientId || pending.redirectUri !== config.redirectUri) throw new ChatGPTError("invalid_callback");
  const tokens = await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code,
    code_verifier: pending.verifier, redirect_uri: pending.redirectUri, client_id: pending.clientId, resource: RESOURCE }));
  try {
    if (!tokens.id_token) throw new ChatGPTError("invalid_callback");
    const identity = await verifyIdentity(tokens.id_token, pending);
    return { credentials: credentials(tokens), subject: identity.sub!, email: typeof identity.email === "string" ? identity.email : null };
  } catch (error) {
    if (tokens.refresh_token) await revoke(tokens.refresh_token).catch(() => false);
    throw error;
  }
}

export async function refreshCredentials(previous: Credentials) {
  const tokens = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", client_id: connectionConfig().clientId,
    refresh_token: previous.refreshToken, resource: RESOURCE }));
  return credentials(tokens, previous);
}

export async function revoke(refreshToken: string) {
  const info = await metadata();
  if (!info.revocation_endpoint) return false;
  try {
    const response = await fetch(info.revocation_endpoint, { method: "POST", redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(10_000), headers: { "content-type": "application/x-www-form-urlencoded", ...clientAuthentication() },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: connectionConfig(false).clientId }) });
    return response.status === 200;
  } catch { return false; }
}
