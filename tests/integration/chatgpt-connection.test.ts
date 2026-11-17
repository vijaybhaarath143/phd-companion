/** Run with npm run test:chatgpt:db: a fresh disposable Docker Postgres, no research data. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { withUser, type SessionUser } from "@/server/db";
import { beginAccessCheck, completeConnection, connectionSummary, disconnectConnection, endAccessCheck, markChecked, startConnection, usableCredentials } from "@/server/chatgpt/connection";
import { ChatGPTError, SCOPES } from "@/server/chatgpt/config";
import { seal } from "@/server/chatgpt/crypto";
import * as protocol from "@/server/chatgpt/protocol";

vi.mock("@/server/chatgpt/protocol", () => ({ authorization: vi.fn(), exchange: vi.fn(), refreshCredentials: vi.fn(), revoke: vi.fn() }));
const credentials = { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: Date.now() + 3_600_000, scopes: SCOPES.split(" ") };
const target = process.env.CHATGPT_TEST_DATABASE_URL;
const sql = postgres(target ?? "postgres://127.0.0.1:1/not-used", { transform: postgres.camel });
let alice: SessionUser;
let bob: SessionUser;
let sequence = 0;
let lastState = "";
const callback = (state = lastState, extra = "") => new URL(`https://phd.example/api/chatgpt/callback?state=${state}&code=code${extra}`);

describe.skipIf(!target)("native ChatGPT connection in real Postgres", () => {
  beforeAll(() => {
    if (process.env.DATABASE_URL !== target || !/^postgres:\/\/postgres@127\.0\.0\.1:\d+\/postgres$/.test(target!)) throw new Error("Only the disposable local test database is allowed");
  });
  beforeEach(async () => {
    vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "enabled"); vi.stubEnv("CHATGPT_CLIENT_ID", "oaiapp_test");
    vi.stubEnv("CHATGPT_REDIRECT_URI", "https://phd.example/api/chatgpt/callback");
    vi.stubEnv("CHATGPT_TOKEN_AUTH_METHOD", "none"); vi.stubEnv("CHATGPT_TOKEN_ENCRYPTION_KEY", "a1".repeat(32));
    vi.clearAllMocks();
    vi.mocked(protocol.authorization).mockImplementation(async subject => {
      lastState = `state-${++sequence}`;
      return { state: lastState, url: "https://auth.openai.com/authorize", pending: { nonce: "nonce", verifier: "verifier", redirectUri: "https://phd.example/api/chatgpt/callback", clientId: "oaiapp_test", subject } };
    });
    vi.mocked(protocol.exchange).mockResolvedValue({ credentials, subject: "openai-alice", email: "alice@example.com" });
    vi.mocked(protocol.revoke).mockResolvedValue(true);
    vi.mocked(protocol.refreshCredentials).mockResolvedValue({ ...credentials, accessToken: "new-access", refreshToken: "new-refresh" });
    alice = { id: crypto.randomUUID(), email: "alice@example.com" }; bob = { id: crypto.randomUUID(), email: "bob@example.com" };
    await sql`insert into auth.users (id) values (${alice.id}), (${bob.id})`;
  });
  afterEach(async () => { await sql`delete from auth.users where id in (${alice.id}, ${bob.id})`; vi.unstubAllEnvs(); });
  afterAll(async () => { await sql.end(); });
  async function connected(expired = false) {
    const attempt = await startConnection(alice);
    await completeConnection(alice, callback(), attempt.browser);
    if (expired) await withUser(alice, tx => tx`update app.chatgpt_connections set credentials = ${seal({ ...credentials, expiresAt: 1 }, alice.id, "credentials")} where owner_id = ${alice.id}`);
  }
  it("RLS isolates owners and denies inbound assistant tokens", async () => {
    await startConnection(alice);
    expect(await withUser(bob, tx => tx`select * from app.chatgpt_connections`)).toHaveLength(0);
    expect(await withUser(bob, tx => tx`select * from app.chatgpt_transactions`)).toHaveLength(0);
    await expect(withUser(bob, tx => tx`insert into app.chatgpt_connections (owner_id) values (${alice.id})`)).rejects.toThrow(/row-level security/);
    const mcp = { ...alice, clientId: crypto.randomUUID(), sessionId: crypto.randomUUID() };
    expect(await withUser(mcp, tx => tx`select * from app.chatgpt_connections`)).toHaveLength(0);
    expect(await withUser(mcp, tx => tx`delete from app.chatgpt_transactions returning owner_id`)).toHaveLength(0);
    await expect(startConnection(mcp)).rejects.toThrow("invalid_callback");
  });
  it("consumes a browser-bound state exactly once and never leaks tokens in its summary", async () => {
    const attempt = await startConnection(alice);
    await expect(completeConnection(alice, callback(), "wrong-browser")).rejects.toThrow("invalid_callback");
    await expect(completeConnection(alice, callback("wrong-state"), attempt.browser)).rejects.toThrow("invalid_callback");
    expect(protocol.exchange).not.toHaveBeenCalled();
    await completeConnection(alice, callback(), attempt.browser);
    await expect(completeConnection(alice, callback(), attempt.browser)).rejects.toThrow("invalid_callback");
    expect(protocol.exchange).toHaveBeenCalledTimes(1);
    const summary = await connectionSummary(alice);
    expect(summary).toEqual({ configured: true, state: "connected", email: "alice@example.com", checkedAt: null });
    expect(JSON.stringify(summary)).not.toContain("access");
    const [row] = await sql`select credentials from app.chatgpt_connections where owner_id = ${alice.id}`;
    expect(row.credentials).not.toContain("old-refresh");
  });
  it("cannot link a callback to a different PhD Companion account", async () => {
    const attempt = await startConnection(alice);
    await expect(completeConnection(bob, callback(), attempt.browser)).rejects.toThrow("invalid_callback");
    expect(protocol.exchange).not.toHaveBeenCalled();
    await completeConnection(alice, callback(), attempt.browser);
    expect((await connectionSummary(bob)).state).toBe("disconnected");
  });
  it("rejects expired, repeated and duplicate-param callbacks before exchange", async () => {
    const attempt = await startConnection(alice);
    await expect(completeConnection(alice, callback(lastState, `&state=${lastState}`), attempt.browser)).rejects.toThrow("invalid_callback");
    await sql`update app.chatgpt_transactions set expires_at = now() - interval '1 second' where owner_id = ${alice.id}`;
    await expect(completeConnection(alice, callback(), attempt.browser)).rejects.toThrow("invalid_callback");
    expect(protocol.exchange).not.toHaveBeenCalled();
  });
  it("declining consumes the attempt and preserves an existing connection", async () => {
    await connected();
    const attempt = await startConnection(alice);
    await expect(completeConnection(alice, callback(lastState, "&error=access_denied"), attempt.browser)).rejects.toThrow("declined");
    expect((await connectionSummary(alice)).state).toBe("connected");
    await expect(completeConnection(alice, callback(), attempt.browser)).rejects.toThrow("invalid_callback");
  });
  it("a new attempt replaces the old attempt and reconnect binds the prior identity", async () => {
    await connected();
    const old = await startConnection(alice); const oldState = lastState;
    const next = await startConnection(alice);
    await expect(completeConnection(alice, callback(oldState), old.browser)).rejects.toThrow("invalid_callback");
    await completeConnection(alice, callback(), next.browser);
    expect(vi.mocked(protocol.exchange).mock.lastCall![1].subject).toBe("openai-alice");
  });
  it("disconnect invalidates an unfinished callback and an in-flight exchange cannot resurrect it", async () => {
    const attempt = await startConnection(alice);
    let finish!: (value: Awaited<ReturnType<typeof protocol.exchange>>) => void;
    vi.mocked(protocol.exchange).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const completion = completeConnection(alice, callback(), attempt.browser);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await disconnectConnection(alice);
    finish({ credentials, subject: "openai-alice", email: "alice@example.com" });
    await expect(completion).rejects.toThrow("conflict");
    expect((await connectionSummary(alice)).state).toBe("disconnected");
    expect(protocol.revoke).toHaveBeenCalledWith("old-refresh");
    expect(await withUser(alice, tx => tx`select * from app.chatgpt_transactions`)).toHaveLength(0);
  });
  it("serializes refresh across requests and rotates the token set once", async () => {
    await connected(true);
    let finish!: (value: typeof credentials) => void;
    vi.mocked(protocol.refreshCredentials).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = usableCredentials(alice);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    await expect(usableCredentials(alice)).rejects.toThrow("busy");
    finish({ ...credentials, accessToken: "new-access", refreshToken: "new-refresh" });
    expect((await first).credentials.refreshToken).toBe("new-refresh");
    expect((await usableCredentials(alice)).credentials.accessToken).toBe("new-access");
    expect(protocol.refreshCredentials).toHaveBeenCalledTimes(1);
  });
  it("keeps credentials on transient failure, and requires reconnect for a rejected grant", async () => {
    await connected(true);
    vi.mocked(protocol.refreshCredentials).mockRejectedValueOnce(new ChatGPTError("retry"));
    await expect(usableCredentials(alice)).rejects.toThrow("retry");
    expect((await connectionSummary(alice)).state).toBe("connected");
    vi.mocked(protocol.refreshCredentials).mockRejectedValueOnce(new ChatGPTError("reconnect_required"));
    await expect(usableCredentials(alice)).rejects.toThrow("reconnect_required");
    expect((await connectionSummary(alice)).state).toBe("reconnect_required");
  });
  it("requires reconnect after a crashed refresh lease without reusing its rotating token", async () => {
    await connected(true);
    await sql`update app.chatgpt_connections set refresh_lease = ${crypto.randomUUID()}, refresh_started_at = now() - interval '2 minutes' where owner_id = ${alice.id}`;
    await expect(usableCredentials(alice)).rejects.toThrow("reconnect_required");
    expect(protocol.refreshCredentials).not.toHaveBeenCalled();
    await expect(startConnection(alice)).resolves.toHaveProperty("browser");
  });
  it("starting OAuth after a crashed lease cannot make the old rotating token usable", async () => {
    await connected(true);
    await sql`update app.chatgpt_connections set refresh_lease = ${crypto.randomUUID()}, refresh_started_at = now() - interval '2 minutes' where owner_id = ${alice.id}`;
    await startConnection(alice);
    await expect(usableCredentials(alice)).rejects.toThrow("reconnect_required");
    expect(protocol.refreshCredentials).not.toHaveBeenCalled();
  });
  it("the kill switch blocks inference and new sign-ins while preserving Disconnect", async () => {
    await connected();
    vi.stubEnv("CHATGPT_HOSTED_PLAN_ACCESS", "");
    const summary = await connectionSummary(alice);
    expect(summary.configured).toBe(false);
    expect(summary.state).toBe("connected");
    await expect(usableCredentials(alice)).rejects.toThrow("setup_required");
    await expect(startConnection(alice)).rejects.toThrow("setup_required");
    expect(await disconnectConnection(alice)).toEqual({ revoked: true });
  });
  it("disconnect stays local if upstream revocation fails and blocks later token use", async () => {
    await connected();
    vi.mocked(protocol.revoke).mockResolvedValueOnce(false);
    expect(await disconnectConnection(alice)).toEqual({ revoked: false });
    await expect(usableCredentials(alice)).rejects.toThrow("reconnect_required");
    const [row] = await sql`select credentials, subject from app.chatgpt_connections where owner_id = ${alice.id}`;
    expect(row).toEqual({ credentials: null, subject: null });
  });
  it("persists only a current successful access check and refuses a late success after disconnect", async () => {
    await connected();
    const { version } = await usableCredentials(alice);
    const lease = await beginAccessCheck(alice, version);
    await markChecked(alice, version, lease);
    expect((await connectionSummary(alice)).checkedAt).toMatch(/^\d{4}-/);
    await disconnectConnection(alice);
    await expect(markChecked(alice, version, lease)).rejects.toThrow("conflict");
    expect((await connectionSummary(alice)).checkedAt).toBeNull();
  });
  it("rate limits access probes across tabs and cleans credentials when an account is deleted", async () => {
    await connected();
    const { version } = await usableCredentials(alice);
    const lease = await beginAccessCheck(alice, version);
    await expect(beginAccessCheck(alice, version)).rejects.toThrow("busy");
    await endAccessCheck(alice, lease);
    await expect(beginAccessCheck(alice, version)).rejects.toThrow("busy");
    await sql`delete from auth.users where id = ${alice.id}`;
    expect(await sql`select * from app.chatgpt_connections where owner_id = ${alice.id}`).toHaveLength(0);
  });
});
