import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { connectionConfig, requireSameOrigin, SCOPES, ISSUER } from "@/server/chatgpt/config";
import { digest, seal, unseal } from "@/server/chatgpt/crypto";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let localKeys: ReturnType<typeof createLocalJWKSet>;
vi.mock("jose", async original => ({ ...await original<typeof import("jose")>(), createRemoteJWKSet: () => localKeys }));
import { authorization, exchange, refreshCredentials, verifyIdentity, revoke, type PendingAuthorization } from "@/server/chatgpt/protocol";

const callback = "https://phd.example/api/chatgpt/callback";
const client = "oaiapp_phd_test";
let tokenResponse: Record<string, unknown>;
let tokenStatus = 200;
const fetchMock = vi.fn();
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  localKeys = createLocalJWKSet({ keys: [await exportJWK(keys.publicKey)] });
});
beforeEach(() => {
  vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "enabled");
  vi.stubEnv("CHATGPT_CLIENT_ID", client);
  vi.stubEnv("CHATGPT_REDIRECT_URI", callback);
  vi.stubEnv("CHATGPT_TOKEN_AUTH_METHOD", "none");
  vi.stubEnv("CHATGPT_TOKEN_ENCRYPTION_KEY", "a1".repeat(32));
  tokenStatus = 200;
  tokenResponse = { access_token: "access-test", refresh_token: "refresh-test", token_type: "Bearer", expires_in: 3600, scope: SCOPES };
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url.includes("openid-configuration")) return Response.json({ issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/api/accounts/authorize`, token_endpoint: `${ISSUER}/api/accounts/oauth/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`, revocation_endpoint: `${ISSUER}/oauth/revoke` });
    if (url.includes("revoke")) return new Response(null, { status: 200 });
    return Response.json(tokenResponse, { status: tokenStatus });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const pending = (): PendingAuthorization => ({ verifier: "verifier", nonce: "nonce", redirectUri: callback, clientId: client, subject: null });
async function signed(claims: JWTPayload = {}, signingKeys = keys) {
  return new SignJWT({ nonce: "nonce", ...claims }).setProtectedHeader({ alg: "RS256" })
    .setIssuer(typeof claims.iss === "string" ? claims.iss : ISSUER).setAudience(claims.aud ?? client)
    .setSubject(claims.sub ?? "account-1").setIssuedAt().setExpirationTime(claims.exp ?? "5m").sign(signingKeys.privateKey);
}

describe("hosted integration gate and credentials", () => {
  it("stays unavailable without explicit hosted access, valid key and a provisioned client", () => {
    expect(connectionConfig().origin).toBe("https://phd.example");
    vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "");
    expect(connectionConfig).toThrow("setup_required");
    vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "enabled");
    vi.stubEnv("CHATGPT_CLIENT_ID", "dynamic_agent_client");
    expect(connectionConfig).toThrow("setup_required");
  });
  it.each(["http://remote.example/api/chatgpt/callback", "https://phd.example/other", `${callback}?next=bad`, "https://user:pass@phd.example/api/chatgpt/callback"])("rejects an unsafe callback %s", value => {
    vi.stubEnv("CHATGPT_REDIRECT_URI", value);
    expect(connectionConfig).toThrow("setup_required");
  });
  it("rejects absent, cross-origin and cross-site mutation origins", () => {
    expect(() => requireSameOrigin(new Request("https://phd.example/api/chatgpt/start", { headers: { origin: "https://phd.example" } }))).not.toThrow();
    for (const headers of ([{}, { origin: "https://evil.example" }, { origin: "https://phd.example", "sec-fetch-site": "cross-site" }] as Record<string, string>[])) {
      expect(() => requireSameOrigin(new Request("https://phd.example/api/chatgpt/start", { headers }))).toThrow();
    }
  });
  it("handles NextURL loopback normalization only in development, with an exact browser Origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHATGPT_REDIRECT_URI", "http://127.0.0.1:1455/api/chatgpt/callback");
    const request = new Request("http://localhost:1455/api/chatgpt/start", { headers: { origin: "http://127.0.0.1:1455" } });
    expect(() => requireSameOrigin(request)).not.toThrow();
    expect(() => requireSameOrigin(new Request(request.url, { headers: { origin: "http://localhost:1455" } }))).toThrow("invalid_callback");
    expect(() => requireSameOrigin(new Request("http://localhost:1456/api/chatgpt/start", { headers: { origin: "http://127.0.0.1:1455" } }))).toThrow("invalid_callback");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => requireSameOrigin(request)).toThrow("setup_required");
  });
  it("authenticated encryption rejects tampering, another owner, purpose and key", () => {
    const value = seal({ refreshToken: "private-token" }, "alice", "credentials");
    expect(value).not.toContain("private-token");
    expect(unseal(value, "alice", "credentials")).toEqual({ refreshToken: "private-token" });
    expect(seal({ refreshToken: "private-token" }, "alice", "credentials")).not.toBe(value);
    expect(() => unseal(value, "bob", "credentials")).toThrow();
    expect(() => unseal(value, "alice", "authorization")).toThrow();
    const parts = value.split("."); parts[3] = "AAAA";
    expect(() => unseal(parts.join("."), "alice", "credentials")).toThrow();
    vi.stubEnv("CHATGPT_TOKEN_ENCRYPTION_KEY", "b2".repeat(32));
    expect(() => unseal(value, "alice", "credentials")).toThrow();
  });
});

describe("OAuth protocol", () => {
  it("generates fresh PKCE/state/nonce and exact provisioned callback and plan scopes", async () => {
    const first = await authorization(null); const second = await authorization(null);
    const url = new URL(first.url);
    expect(url.origin).toBe(ISSUER);
    expect(url.searchParams.get("code_challenge")).toBe(digest(first.pending.verifier));
    expect(url.searchParams.get("scope")).toBe(SCOPES);
    expect(url.searchParams.get("redirect_uri")).toBe(callback);
    expect(url.searchParams.get("client_id")).toBe(client);
    expect(first.state).not.toBe(second.state);
    expect(first.pending.nonce).not.toBe(second.pending.nonce);
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
  it("exchanges only on the server, verifies JWT and requires explicit plan grants", async () => {
    tokenResponse.id_token = await signed();
    const result = await exchange("code-test", pending());
    expect(result.subject).toBe("account-1");
    expect(result.credentials.accessToken).toBe("access-test");
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith("/oauth/token"))![1];
    expect(request.body.get("code_verifier")).toBe("verifier");
    expect(request.body.get("resource")).toBe("https://api.openai.com/v1");
    expect(request.body.has("client_secret")).toBe(false);
    tokenResponse.scope = "openid profile email";
    await expect(exchange("code-test", pending())).rejects.toThrow("plan_required");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("revoke"))).toBe(true);
  });
  it("doesn't trust scopes supplied outside the token response", async () => {
    tokenResponse.id_token = await signed(); delete tokenResponse.scope;
    await expect(exchange("code-test", pending())).rejects.toThrow("plan_required");
  });
  it.each([{ nonce: "wrong" }, { iss: "https://evil.example" }, { aud: "other-client" }, { exp: 1 }])("rejects invalid ID token claims %j", async claims => {
    await expect(verifyIdentity(await signed(claims), pending())).rejects.toThrow();
  });
  it("rejects a forged signature and a different account on reconnect", async () => {
    const forged = await signed({}, await generateKeyPair("RS256"));
    await expect(verifyIdentity(forged, pending())).rejects.toThrow();
    await expect(verifyIdentity(await signed({ sub: "other" }), { ...pending(), subject: "account-1" })).rejects.toThrow("invalid_callback");
  });
  it("uses the provisioned confidential client method without putting secrets in the form", async () => {
    vi.stubEnv("CHATGPT_TOKEN_AUTH_METHOD", "client_secret_basic");
    vi.stubEnv("CHATGPT_CLIENT_SECRET", "secret:test");
    tokenResponse.id_token = await signed();
    await exchange("code-test", pending());
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith("/oauth/token"))![1];
    expect(request.headers.authorization).toMatch(/^Basic /);
    expect(request.body.toString()).not.toContain("secret");
    vi.stubEnv("CHATGPT_CLIENT_SECRET", "");
    expect(connectionConfig).toThrow("setup_required");
  });
  it("rotates access and refresh tokens together, retaining omitted grant/refresh values", async () => {
    const previous = { accessToken: "old", refreshToken: "old-refresh", scopes: SCOPES.split(" "), expiresAt: 1 };
    expect((await refreshCredentials(previous)).refreshToken).toBe("refresh-test");
    delete tokenResponse.scope; delete tokenResponse.refresh_token;
    expect((await refreshCredentials(previous)).refreshToken).toBe("old-refresh");
    const request = fetchMock.mock.calls.find(([url]) => url.endsWith("/oauth/token"))![1];
    expect(request.body.get("grant_type")).toBe("refresh_token");
    expect(request.body.has("scope")).toBe(false);
  });
  it("redacts provider errors and distinguishes rejected grants from transient errors", async () => {
    tokenResponse = { error: "invalid_grant", detail: "private-token" }; tokenStatus = 400;
    await expect(refreshCredentials({ accessToken: "old", refreshToken: "r", scopes: [], expiresAt: 1 })).rejects.toThrow(/^reconnect_required$/);
    tokenStatus = 503;
    await expect(refreshCredentials({ accessToken: "old", refreshToken: "r", scopes: [], expiresAt: 1 })).rejects.toThrow(/^retry$/);
  });
  it("revokes the refresh session with the registered client", async () => {
    expect(await revoke("r")).toBe(true);
    const request = fetchMock.mock.calls.find(([url]) => url.includes("revoke"))![1];
    expect(request.body.get("token")).toBe("r");
    expect(request.body.get("token_type_hint")).toBe("refresh_token");
    expect(request.body.get("client_id")).toBe(client);
  });
});
