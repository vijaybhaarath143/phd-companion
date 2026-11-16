import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/server/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/server/chatgpt/connection", () => ({ startConnection: vi.fn(), completeConnection: vi.fn(), disconnectConnection: vi.fn() }));
vi.mock("@/server/chatgpt/inference", () => ({ checkSubscriptionAccess: vi.fn() }));
import { currentUser } from "@/server/auth";
import { startConnection, completeConnection, disconnectConnection } from "@/server/chatgpt/connection";
import { checkSubscriptionAccess } from "@/server/chatgpt/inference";
import { ChatGPTError, TRANSACTION_COOKIE } from "@/server/chatgpt/config";
import { POST as start } from "@/app/api/chatgpt/start/route";
import { GET as callback } from "@/app/api/chatgpt/callback/route";
import { POST as disconnect } from "@/app/api/chatgpt/disconnect/route";
import { POST as check } from "@/app/api/chatgpt/check/route";

const origin = "https://phd.example";
const user = { id: "alice", email: "alice@example.com" };
const request = (path = "start", headers: Record<string, string> = { origin }) => new Request(`${origin}/api/chatgpt/${path}`, { method: "POST", headers });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "enabled"); vi.stubEnv("CHATGPT_CLIENT_ID", "oaiapp_test");
  vi.stubEnv("CHATGPT_REDIRECT_URI", `${origin}/api/chatgpt/callback`); vi.stubEnv("CHATGPT_TOKEN_AUTH_METHOD", "none");
  vi.stubEnv("CHATGPT_TOKEN_ENCRYPTION_KEY", "a1".repeat(32));
  vi.mocked(currentUser).mockResolvedValue(user);
  vi.mocked(startConnection).mockResolvedValue({ url: "https://auth.openai.com/authorize?state=random", browser: "browser-binding" });
  vi.mocked(completeConnection).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("ChatGPT browser endpoints", () => {
  it("starts only a same-origin signed-in POST and returns no credentials", async () => {
    const response = await start(request());
    expect(await response.json()).toEqual({ authorizationUrl: "https://auth.openai.com/authorize?state=random" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).not.toContain("verifier");
  });
  it("rejects a cross-site start without creating an attempt", async () => {
    expect((await start(request("start", { origin: "https://evil.example" }))).status).toBe(400);
    expect(startConnection).not.toHaveBeenCalled();
  });
  it("returns a JSON 401 for every signed-out mutation", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    for (const action of [start, check, disconnect]) {
      const response = await action(request());
      expect(response.status).toBe(401); expect(await response.json()).toEqual({ error: "sign_in_required" });
      expect(response.headers.get("location")).toBeNull();
    }
  });
  it("always cleans the callback URL and clears its temporary cookie", async () => {
    const response = await callback(new NextRequest(`${origin}/api/chatgpt/callback?code=private-code&state=random`, { headers: { cookie: `${TRANSACTION_COOKIE}=browser-binding` } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/settings?chatgpt=connected#chatgpt`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(completeConnection).toHaveBeenCalledWith(user, expect.objectContaining({ origin, pathname: "/api/chatgpt/callback" }), "browser-binding");
  });
  it("does not redeem a code after app sign-in expires", async () => {
    vi.mocked(currentUser).mockResolvedValue(null);
    const response = await callback(new NextRequest(`${origin}/api/chatgpt/callback?code=private-code`));
    expect(completeConnection).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("chatgpt=sign_in_required");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("redacts unexpected callback and upstream failures", async () => {
    vi.mocked(completeConnection).mockRejectedValueOnce(new Error("refresh-secret-private"));
    const response = await callback(new NextRequest(`${origin}/api/chatgpt/callback?code=private-code`));
    expect(response.headers.get("location")).toBe(`${origin}/settings?chatgpt=retry#chatgpt`);
    vi.mocked(checkSubscriptionAccess).mockRejectedValueOnce(new Error("token-secret-private"));
    const failed = await check(request("check"));
    expect(await failed.json()).toEqual({ error: "retry" });
  });
  it("doesn't expose a provisioned button when hosted access is off", async () => {
    vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "");
    const response = await start(request());
    expect(response.status).toBe(503); expect(startConnection).not.toHaveBeenCalled();
  });
  it("returns actionable plan limits and unconfirmed remote revocation", async () => {
    vi.mocked(checkSubscriptionAccess).mockRejectedValueOnce(new ChatGPTError("usage_limit"));
    const response = await check(request("check"));
    expect(response.status).toBe(429); expect(await response.json()).toEqual({ error: "usage_limit" });
    vi.mocked(disconnectConnection).mockResolvedValueOnce({ revoked: false });
    expect(await (await disconnect(request("disconnect"))).json()).toEqual({ revoked: false });
  });
});
