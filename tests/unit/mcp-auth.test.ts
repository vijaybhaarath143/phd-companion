import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, errors, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { AuthUnavailableError, bearerToken, ConnectorAuthError, verifyAccessToken, verifyWithAuthServer } from "@/server/mcp/auth";
import { safeReturnTo } from "@/lib/return-to";

const ISSUER = "https://example.supabase.co/auth/v1";
const USER = "6f1c2a52-1f0e-4a6b-9a55-3c0e3a8f1d11";
const CLIENT = "0b3e8a40-5f4c-4c3d-8d1e-2f6a7b8c9d00";
const SESSION = "9d2f6c1a-7e3b-4f5a-8c9d-0e1f2a3b4c5d";

let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;
let otherKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  keys = createLocalJWKSet({ keys: [jwk] });
  otherKey = (await generateKeyPair("ES256")).privateKey as CryptoKey;
});

type Claims = Record<string, unknown>;
const good: Claims = { sub: USER, role: "authenticated", email: "scholar@phd.test", client_id: CLIENT, session_id: SESSION, aud: "authenticated" };

async function token(claims: Claims = good, opts: { key?: CryptoKey; iss?: string; exp?: string | number } = {}) {
  const { aud, ...rest } = claims;
  let jwt = new SignJWT(rest).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuedAt().setIssuer(opts.iss ?? ISSUER).setExpirationTime(opts.exp ?? "1h");
  if (aud) jwt = jwt.setAudience(aud as string);
  return jwt.sign(opts.key ?? privateKey);
}

const verify = (t: string) => verifyAccessToken(t, { keys, issuer: ISSUER });

describe("reading the bearer token", () => {
  it("accepts a well-formed Bearer header", () => {
    expect(bearerToken("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
    expect(bearerToken("bearer  aaa.bbb.ccc ")).toBe("aaa.bbb.ccc");
  });
  it("rejects anything else", () => {
    for (const h of [null, "", "Basic abc", "Bearer", "Bearer abc", "Bearer a.b.c d", "Bearer a.b.c,Bearer x.y.z"]) {
      expect(bearerToken(h)).toBeNull();
    }
  });
});

describe("checking a connector access token", () => {
  it("accepts a token Supabase issued to a connected app, and returns who it's for", async () => {
    expect(await verify(await token())).toEqual({ id: USER, email: "scholar@phd.test", clientId: CLIENT, sessionId: SESSION });
  });

  it("rejects a token signed with another key", async () => {
    await expect(verify(await token(good, { key: otherKey }))).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it("rejects a token from another project (issuer)", async () => {
    await expect(verify(await token(good, { iss: "https://evil.supabase.co/auth/v1" }))).rejects.toThrow(ConnectorAuthError);
  });

  it("rejects an expired token", async () => {
    await expect(verify(await token(good, { exp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toThrow(/expired/);
  });

  it("rejects the wrong audience", async () => {
    await expect(verify(await token({ ...good, aud: "something-else" }))).rejects.toThrow(ConnectorAuthError);
  });

  it("rejects an ordinary browser sign-in token (no client_id)", async () => {
    const { client_id: _c, ...browser } = good;
    await expect(verify(await token(browser))).rejects.toThrow(/connected app/);
  });

  it("rejects anonymous, service and malformed subjects", async () => {
    await expect(verify(await token({ ...good, is_anonymous: true }))).rejects.toThrow(ConnectorAuthError);
    await expect(verify(await token({ ...good, role: "service_role" }))).rejects.toThrow(ConnectorAuthError);
    await expect(verify(await token({ ...good, sub: "not-a-uuid" }))).rejects.toThrow(ConnectorAuthError);
    await expect(verify(await token({ ...good, session_id: undefined }))).rejects.toThrow(ConnectorAuthError);
  });

  it("rejects garbage", async () => {
    await expect(verify("aaa.bbb.ccc")).rejects.toThrow(ConnectorAuthError);
  });

  it("asks Supabase Auth about shared-secret (HS256) tokens, and still checks the claims", async () => {
    const secret = new TextEncoder().encode("x".repeat(32));
    const hs = (claims: Claims) =>
      new SignJWT({ ...claims, aud: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setExpirationTime("1h").sign(secret);
    const t = await hs(good);
    let asked = 0;
    const ok = await verifyAccessToken(t, {
      keys,
      issuer: ISSUER,
      verifyRemotely: async (tok) => {
        asked++;
        const { decodeJwt } = await import("jose");
        return decodeJwt(tok);
      },
    });
    expect(asked).toBe(1);
    expect(ok.id).toBe(USER);

    await expect(verifyAccessToken(t, { keys, issuer: ISSUER, verifyRemotely: async () => { throw new ConnectorAuthError("nope"); } }))
      .rejects.toThrow("nope");
    const { client_id: _c, ...browser } = good;
    await expect(verifyAccessToken(await hs(browser), { keys, issuer: ISSUER, verifyRemotely: async (tok) => (await import("jose")).decodeJwt(tok) }))
      .rejects.toThrow(/connected app/);
  });
});

describe("when Supabase Auth can't be reached", () => {
  const failingKeys = (e: unknown): JWTVerifyGetKey => async () => {
    throw e;
  };

  it("answers 'try again' (not 'invalid token') when the published keys can't be fetched", async () => {
    const t = await token();
    for (const e of [new errors.JWKSTimeout(), new TypeError("fetch failed"), new errors.JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response")]) {
      await expect(verifyAccessToken(t, { keys: failingKeys(e), issuer: ISSUER })).rejects.toBeInstanceOf(AuthUnavailableError);
    }
  });

  it("still says 'invalid' for a token no published key matches", async () => {
    const t = await token();
    await expect(verifyAccessToken(t, { keys: failingKeys(new errors.JWKSNoMatchingKey()), issuer: ISSUER })).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it("checks shared-secret tokens with Supabase Auth: an outage or 5xx is 'try again', a refusal is 'invalid'", async () => {
    const answer = (status: number): typeof fetch => async () => new Response("{}", { status });
    const down: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(verifyWithAuthServer("a.b.c", ISSUER, down)).rejects.toBeInstanceOf(AuthUnavailableError);
    await expect(verifyWithAuthServer("a.b.c", ISSUER, answer(503))).rejects.toBeInstanceOf(AuthUnavailableError);
    await expect(verifyWithAuthServer("a.b.c", ISSUER, answer(500))).rejects.toBeInstanceOf(AuthUnavailableError);
    await expect(verifyWithAuthServer("a.b.c", ISSUER, answer(401))).rejects.toBeInstanceOf(ConnectorAuthError);
    await expect(verifyWithAuthServer("a.b.c", ISSUER, answer(403))).rejects.toBeInstanceOf(ConnectorAuthError);

    // …and verifyAccessToken passes the outage on unchanged
    const secret = new TextEncoder().encode("x".repeat(32));
    const hs = await new SignJWT({ ...good }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setExpirationTime("1h").sign(secret);
    await expect(verifyAccessToken(hs, { keys, issuer: ISSUER, verifyRemotely: (t) => verifyWithAuthServer(t, ISSUER, answer(502)) }))
      .rejects.toBeInstanceOf(AuthUnavailableError);
  });
});

describe("returning to the consent page after sign-in", () => {
  it("only ever returns to the consent page", () => {
    expect(safeReturnTo("/oauth/consent?authorization_id=abc-123")).toBe("/oauth/consent?authorization_id=abc-123");
    expect(safeReturnTo("/oauth/consent")).toBe("/oauth/consent");
    for (const bad of ["https://evil.example", "//evil.example", "/oauth/consent?authorization_id=x&next=//evil", "/settings", "", undefined]) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });
});
