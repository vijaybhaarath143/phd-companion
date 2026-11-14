/**
 * Which apps may connect to PhD Companion, judged by where their sign-in returns to — never by
 * the name an app registers for itself (anyone can register an app called "ChatGPT").
 *
 * - ChatGPT: every redirect address is on https://chatgpt.com, https://chat.openai.com or
 *   https://<name>.openai.com.
 * - Codex (or another app on her own computer): every redirect address is a loopback address,
 *   http://127.0.0.1, http://localhost or http://[::1], on any port.
 *
 * Anything else is refused on the consent page, whatever it calls itself. The database labels
 * what an app adds by the same rule (app.request_source(): 'chatgpt', 'codex' or 'mcp').
 * Plain module (no server imports) so it can be tested on its own.
 */

export type ClientKind = "chatgpt" | "local" | "other";

export type ClientCheck = {
  allowed: boolean;
  kind: ClientKind;
  /** Who it really is, in words for the consent page: "ChatGPT (chatgpt.com)", "an app on this computer (Codex)". */
  label: string;
  /** The hosts its sign-in can return to, e.g. ["chatgpt.com"] or ["evil.example"]. */
  hosts: string[];
};

const OPENAI_HOST = /^(chatgpt\.com|chat\.openai\.com|[a-z0-9-]+\.openai\.com)$/;
const LOOPBACK_HOST = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** One redirect address: on OpenAI's own sites, on her own computer, or neither. */
export function classifyRedirect(uri: string): "chatgpt" | "local" | null {
  let u: URL;
  try {
    u = new URL(uri.trim());
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  if (u.protocol === "https:" && u.port === "" && OPENAI_HOST.test(u.hostname)) return "chatgpt";
  if (u.protocol === "http:" && LOOPBACK_HOST.has(u.hostname)) return "local";
  return null;
}

/** Supabase Auth keeps a client's redirect addresses as one text value (comma / space separated). */
export function splitRedirectUris(value: string | null | undefined): string[] {
  return (value ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function hostOf(uri: string) {
  try {
    return new URL(uri.trim()).host;
  } catch {
    return uri.trim().slice(0, 100) || "an unknown address";
  }
}

/**
 * Judge an app by all of its redirect addresses. Every one must be on OpenAI's sites (ChatGPT)
 * or every one must be on her own computer (Codex); a mix, or anything else, is refused.
 */
export function classifyClient(redirectUris: string[], name?: string | null): ClientCheck {
  const uris = redirectUris.map((u) => u.trim()).filter(Boolean);
  const hosts = [...new Set(uris.map(hostOf))];
  const kinds = uris.map(classifyRedirect);
  if (uris.length > 0 && kinds.every((k) => k === "chatgpt")) {
    return { allowed: true, kind: "chatgpt", label: `ChatGPT (${hosts.join(", ")})`, hosts };
  }
  if (uris.length > 0 && kinds.every((k) => k === "local")) {
    const codex = /codex/i.test(name ?? "");
    return { allowed: true, kind: "local", label: codex ? "an app on this computer (Codex)" : "an app on this computer", hosts };
  }
  return { allowed: false, kind: "other", label: hosts.length ? `an app at ${hosts.join(", ")}` : "an unknown app", hosts };
}
