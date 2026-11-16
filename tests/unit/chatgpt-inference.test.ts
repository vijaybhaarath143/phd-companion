import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/chatgpt/connection", () => ({
  usableCredentials: vi.fn(async () => ({ credentials: { accessToken: "test-private-token" }, version: 4 })),
  beginAccessCheck: vi.fn(async () => "lease"), endAccessCheck: vi.fn(), markChecked: vi.fn(), markReconnect: vi.fn(),
}));
import { checkSubscriptionAccess, responseEvents } from "@/server/chatgpt/inference";
import { beginAccessCheck, endAccessCheck, markChecked, markReconnect } from "@/server/chatgpt/connection";
const user = { id: "alice", email: "alice@example.com" };
const eventStream = (value: string, split = false) => new ReadableStream<Uint8Array>({ start(controller) {
  const bytes = new TextEncoder().encode(value);
  if (split) for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
  else controller.enqueue(bytes);
  controller.close();
} });
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const setup = (stream: string) => fetchMock.mockImplementation(async (url: string) => url.endsWith("/models") ?
  Response.json({ models: [{ slug: "hidden", visibility: "hide" }, { slug: "account-model", visibility: "list" }] }) :
  new Response(eventStream(stream), { headers: { "content-type": "text/event-stream" } }));

describe("subscription proof", () => {
  it("uses account models, store:false and stream:true, and marks checked only on completed", async () => {
    setup('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: {"type":"response.completed"}\n\n');
    await checkSubscriptionAccess(user);
    const [url, request] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(JSON.parse(request.body)).toEqual({ model: "account-model", input: [{ role: "user", content: "Reply with exactly: OK" }], store: false, stream: true });
    expect(markChecked).toHaveBeenCalledWith(user, 4, "lease");
    expect(endAccessCheck).toHaveBeenCalledWith(user, "lease");
  });
  it.each([
    ['data: {"type":"response.output_text.delta"}\n\n', "retry"],
    ['data: {"type":"response.incomplete"}\n\n', "retry"],
    ['data: {"type":"response.completed"}', "retry"],
    ['data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n', "usage_limit"],
    ['data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_unavailable"}}}\n\n', "plan_required"],
  ])("does not report success for a failed or truncated stream", async (stream, code) => {
    setup(stream);
    await expect(checkSubscriptionAccess(user)).rejects.toThrow(code);
    expect(markChecked).not.toHaveBeenCalled();
    expect(endAccessCheck).toHaveBeenCalled();
  });
  it("a rejected access token requires reconnect", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(checkSubscriptionAccess(user)).rejects.toThrow("reconnect_required");
    expect(markReconnect).toHaveBeenCalledWith(user, 4);
  });
  it("busy checks never send a second inference request", async () => {
    vi.mocked(beginAccessCheck).mockRejectedValueOnce(new Error("busy"));
    await expect(checkSubscriptionAccess(user)).rejects.toThrow("busy");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels the underlying stream reader after the terminal event", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('data: {"type":"response.completed"}\n\n')); }, cancel });
    for await (const event of responseEvents(body)) { expect(event.type).toBe("response.completed"); break; }
    expect(cancel).toHaveBeenCalled();
  });
  it("decodes UTF-8 and CRLF split at every byte", async () => {
    const events = [];
    for await (const event of responseEvents(eventStream(':comment\r\ndata: {"type":"réponse"}\r\n\r\ndata: [DONE]\r\n\r\n', true))) events.push(event);
    expect(events).toEqual([{ type: "réponse" }]);
  });
});
