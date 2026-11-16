import "server-only";

export class ChatGPTError extends Error {
  constructor(public readonly code: "setup_required" | "reconnect_required" | "retry" | "busy" | "invalid_callback" | "declined" | "plan_required" | "usage_limit" | "conflict") {
    super(code);
    this.name = "ChatGPTError";
  }
}

export const SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
export const RESOURCE = "https://api.openai.com/v1";
export const ISSUER = "https://auth.openai.com";
export const CALLBACK_PATH = "/api/chatgpt/callback";
export const TRANSACTION_COOKIE = "pc-chatgpt-transaction";

/** Only an explicitly provisioned hosted client. Never borrow another app's client ID. */
export function connectionConfig(requireHostedAccess = true) {
  const clientId = process.env.CHATGPT_CLIENT_ID;
  const redirectUri = process.env.CHATGPT_REDIRECT_URI;
  const key = process.env.CHATGPT_TOKEN_ENCRYPTION_KEY;
  const method = process.env.CHATGPT_TOKEN_AUTH_METHOD;
  if ((requireHostedAccess && process.env.CHATGPT_HOSTED_PLAN_ACCESS !== "enabled") || !clientId?.startsWith("oaiapp_") ||
      !redirectUri || !key || !/^[a-f0-9]{64}$/i.test(key) ||
      (method !== "none" && method !== "client_secret_basic") ||
      (method === "client_secret_basic" && !process.env.CHATGPT_CLIENT_SECRET)) {
    throw new ChatGPTError("setup_required");
  }
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new ChatGPTError("setup_required"); }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if ((url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && loopback && url.protocol === "http:")) ||
      url.pathname !== CALLBACK_PATH || url.search || url.hash || url.username || url.password) {
    throw new ChatGPTError("setup_required");
  }
  return { clientId, redirectUri, origin: url.origin, key: Buffer.from(key, "hex"), method,
    clientSecret: method === "client_secret_basic" ? process.env.CHATGPT_CLIENT_SECRET! : null };
}

export function connectionConfigured() {
  try { connectionConfig(); return true; } catch { return false; }
}

/** NextURL canonicalizes IPv4 loopback to localhost. Accept only that dev-only rewrite. */
export function matchesRequestOrigin(actual: string, expected: string) {
  if (actual === expected) return true;
  if (process.env.NODE_ENV === "production") return false;
  const a = new URL(actual); const e = new URL(expected);
  return e.hostname === "127.0.0.1" && a.hostname === "localhost" && a.protocol === e.protocol && a.port === e.port;
}

export function requireSameOrigin(request: Request) {
  const { origin } = connectionConfig(false);
  if (request.headers.get("origin") !== origin || !matchesRequestOrigin(new URL(request.url).origin, origin) ||
      request.headers.get("sec-fetch-site") === "cross-site") throw new ChatGPTError("invalid_callback");
}
