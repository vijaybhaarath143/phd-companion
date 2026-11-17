import "server-only";
import { z } from "zod";
import type { SessionUser } from "@/server/db";
import { ChatGPTError, RESOURCE } from "./config";
import { beginAccessCheck, endAccessCheck, markChecked, markReconnect, usableCredentials } from "./connection";

/** Decode SSE independently of TCP chunk boundaries, including CRLF and UTF-8 splits. */
export async function* responseEvents(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  const consume = (line: string) => {
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    if (line === "" && data.length) {
      const joined = data.join("\n"); data = [];
      if (joined !== "[DONE]") return JSON.parse(joined) as { type?: string; response?: { error?: { code?: string } }; code?: string };
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000 || data.join("").length > 1_000_000) throw new ChatGPTError("retry");
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
        const event = consume(line); if (event) yield event;
      }
      if (done) break;
    }
    // Deliberately require complete SSE frames; a truncated final event is not success.
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

function providerError(status: number) {
  if (status === 401) return new ChatGPTError("reconnect_required");
  if (status === 403) return new ChatGPTError("plan_required");
  if (status === 429) return new ChatGPTError("usage_limit");
  return new ChatGPTError("retry");
}

/** Explicit user-triggered proof. Sends no research data and uses a small amount of plan usage. */
export async function checkSubscriptionAccess(user: SessionUser) {
  const { credentials, version } = await usableCredentials(user);
  const lease = await beginAccessCheck(user, version);
  const headers = { authorization: `Bearer ${credentials.accessToken}` };
  const signal = AbortSignal.timeout(25_000);
  try {
    const catalog = await fetch(`${RESOURCE}/models`, { headers, signal, cache: "no-store", redirect: "error" });
    if (!catalog.ok) throw providerError(catalog.status);
    const parsed = z.object({ models: z.array(z.object({ slug: z.string().min(1), visibility: z.string() })) }).safeParse(await catalog.json());
    const model = parsed.success ? parsed.data.models.find(m => m.visibility === "list")?.slug : null;
    if (!model) throw new ChatGPTError("plan_required");
    const response = await fetch(`${RESOURCE}/responses`, { method: "POST", signal, cache: "no-store", redirect: "error",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ model, input: [{ role: "user", content: "Reply with exactly: OK" }], store: false, stream: true }) });
    if (!response.ok) throw providerError(response.status);
    if (!response.body) throw new ChatGPTError("retry");
    let completed = false;
    for await (const event of responseEvents(response.body)) {
      if (event.type === "response.completed") { completed = true; break; }
      if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") {
        const code = event.response?.error?.code ?? event.code;
        if (code === "subscription_sharing_usage_limit_exceeded") throw new ChatGPTError("usage_limit");
        if (code === "subscription_sharing_usage_unavailable") throw new ChatGPTError("plan_required");
        throw new ChatGPTError("retry");
      }
    }
    if (!completed) throw new ChatGPTError("retry");
    await markChecked(user, version, lease);
  } catch (error) {
    if (error instanceof ChatGPTError && error.code === "reconnect_required") await markReconnect(user, version);
    throw error instanceof ChatGPTError ? error : new ChatGPTError("retry");
  } finally { await endAccessCheck(user, lease); }
}
