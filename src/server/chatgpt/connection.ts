import "server-only";
import { randomUUID } from "node:crypto";
import { withUser, type SessionUser } from "@/server/db";
import { ChatGPTError, connectionConfig, connectionConfigured, matchesRequestOrigin } from "./config";
import { digest, randomValue, seal, unseal } from "./crypto";
import * as protocol from "./protocol";
import type { Credentials, PendingAuthorization } from "./protocol";

export type ConnectionSummary = {
  configured: boolean; state: "disconnected" | "connected" | "reconnect_required";
  email: string | null; checkedAt: string | null;
};
type ConnectionRow = { version: number; clientId: string | null; subject: string | null; email: string | null;
  credentials: string | null; status: ConnectionSummary["state"]; checkedAt: Date | null;
  refreshLease: string | null; refreshStartedAt: Date | null };

function browserOnly(user: SessionUser) {
  if (user.clientId || user.sessionId) throw new ChatGPTError("invalid_callback");
}
async function read(user: SessionUser) {
  browserOnly(user);
  return withUser(user, async tx => (await tx<ConnectionRow[]>`select * from app.chatgpt_connections where owner_id = ${user.id}`)[0]);
}
export async function connectionSummary(user: SessionUser): Promise<ConnectionSummary> {
  browserOnly(user);
  // A deployment without this feature configured doesn't require the migration yet.
  let config: ReturnType<typeof connectionConfig>;
  try { config = connectionConfig(false); }
  catch { return { configured: false, state: "disconnected", email: null, checkedAt: null }; }
  const row = await read(user);
  const state = row?.clientId && row.clientId !== config.clientId ? "reconnect_required" : row?.status ?? "disconnected";
  return { configured: connectionConfigured(), state, email: row?.email ?? null, checkedAt: row?.checkedAt?.toISOString() ?? null };
}

export async function startConnection(user: SessionUser) {
  browserOnly(user);
  const config = connectionConfig();
  const existing = await read(user);
  // Reconnect binds to the previously validated subject. Disconnect first to switch accounts.
  const auth = await protocol.authorization(existing?.clientId === config.clientId ? existing.subject : null);
  const browser = randomValue();
  await withUser(user, async tx => {
    await tx`insert into app.chatgpt_connections (owner_id) values (${user.id}) on conflict do nothing`;
    const [row] = await tx<ConnectionRow[]>`update app.chatgpt_connections set version = version + 1,
      status = case when refresh_lease is not null then 'reconnect_required' else status end,
      checked_at = case when refresh_lease is not null then null else checked_at end,
      refresh_lease = null, refresh_started_at = null
      where owner_id = ${user.id} and (refresh_lease is null or refresh_started_at < now() - interval '60 seconds') returning *`;
    if (!row) throw new ChatGPTError("busy");
    // Subject might have changed while discovery was in flight. Bind to the locked row.
    auth.pending.subject = row.clientId === config.clientId ? row.subject : null;
    await tx`insert into app.chatgpt_transactions (owner_id, state_hash, browser_hash, payload, connection_version, expires_at)
      values (${user.id}, ${digest(auth.state)}, ${digest(browser)}, ${seal(auth.pending, user.id, "authorization")}, ${row.version}, now() + interval '10 minutes')
      on conflict (owner_id) do update set state_hash = excluded.state_hash, browser_hash = excluded.browser_hash,
        payload = excluded.payload, connection_version = excluded.connection_version, expires_at = excluded.expires_at`;
  });
  return { url: auth.url, browser };
}

/** One atomic DELETE consumes a verified attempt across all Vercel instances. */
export async function completeConnection(user: SessionUser, url: URL, browser: string | undefined) {
  browserOnly(user);
  const config = connectionConfig();
  if (!matchesRequestOrigin(url.origin, config.origin) || !browser || browser.length > 200) throw new ChatGPTError("invalid_callback");
  const states = url.searchParams.getAll("state");
  if (states.length !== 1 || !states[0] || states[0].length > 200) throw new ChatGPTError("invalid_callback");
  const attempt = await withUser(user, async tx => {
    const [row] = await tx<{ payload: string; connectionVersion: number }[]>`delete from app.chatgpt_transactions
      where owner_id = ${user.id} and state_hash = ${digest(states[0])} and browser_hash = ${digest(browser)} and expires_at > now()
      returning payload, connection_version`;
    return row;
  });
  if (!attempt) throw new ChatGPTError("invalid_callback");
  if (url.searchParams.has("error")) throw new ChatGPTError(url.searchParams.get("error") === "access_denied" ? "declined" : "retry");
  const codes = url.searchParams.getAll("code");
  const clients = url.searchParams.getAll("client_id");
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096 || clients.length > 1 ||
      (clients.length === 1 && clients[0] !== config.clientId)) throw new ChatGPTError("invalid_callback");
  const pending = unseal<PendingAuthorization>(attempt.payload, user.id, "authorization");
  const result = await protocol.exchange(codes[0], pending);
  const saved = await withUser(user, tx => tx`update app.chatgpt_connections
    set client_id = ${config.clientId}, subject = ${result.subject}, email = ${result.email},
      credentials = ${seal(result.credentials, user.id, "credentials")}, status = 'connected', checked_at = null,
      version = version + 1, updated_at = now(), refresh_lease = null, refresh_started_at = null
    where owner_id = ${user.id} and version = ${attempt.connectionVersion} returning owner_id`).catch(async error => {
    await protocol.revoke(result.credentials.refreshToken).catch(() => false);
    throw error;
  });
  if (!saved.length) {
    await protocol.revoke(result.credentials.refreshToken).catch(() => false);
    throw new ChatGPTError("conflict");
  }
}

/** Server-only credential access. Never return this value from an action or route. */
export async function usableCredentials(user: SessionUser): Promise<{ credentials: Credentials; version: number }> {
  browserOnly(user);
  const config = connectionConfig();
  const row = await read(user);
  if (!row?.credentials || row.status !== "connected" || row.clientId !== config.clientId) throw new ChatGPTError("reconnect_required");
  let previous: Credentials;
  try { previous = unseal<Credentials>(row.credentials, user.id, "credentials"); } catch { throw new ChatGPTError("reconnect_required"); }
  if (!row.refreshLease && previous.expiresAt > Date.now() + 60_000) return { credentials: previous, version: row.version };
  // A lost response might already have rotated a refresh token. Do not reuse it after a crashed lease.
  if (row.refreshLease) {
    if (row.refreshStartedAt && row.refreshStartedAt.getTime() > Date.now() - 60_000) throw new ChatGPTError("busy");
    await withUser(user, tx => tx`update app.chatgpt_connections set status = 'reconnect_required', checked_at = null,
      refresh_lease = null, refresh_started_at = null, version = version + 1 where owner_id = ${user.id} and version = ${row.version}`);
    throw new ChatGPTError("reconnect_required");
  }
  const lease = randomUUID();
  const acquired = await withUser(user, tx => tx`update app.chatgpt_connections set refresh_lease = ${lease}, refresh_started_at = now()
    where owner_id = ${user.id} and version = ${row.version} and refresh_lease is null returning owner_id`);
  if (!acquired.length) throw new ChatGPTError("busy");
  let next: Credentials;
  try { next = await protocol.refreshCredentials(previous); } catch (error) {
    // An explicit transient provider error preserves the grant. Unknown network outcomes require reauthorization.
    const retry = error instanceof ChatGPTError && error.code === "retry";
    await withUser(user, tx => tx`update app.chatgpt_connections set refresh_lease = null, refresh_started_at = null,
      status = ${retry ? "connected" : "reconnect_required"}, checked_at = null, version = version + 1
      where owner_id = ${user.id} and refresh_lease = ${lease} and version = ${row.version}`);
    throw error instanceof ChatGPTError ? error : new ChatGPTError("reconnect_required");
  }
  const updated = await withUser(user, tx => tx<{ version: number }[]>`update app.chatgpt_connections
    set credentials = ${seal(next, user.id, "credentials")}, refresh_lease = null, refresh_started_at = null,
      version = version + 1, updated_at = now() where owner_id = ${user.id} and version = ${row.version} and refresh_lease = ${lease} returning version`).catch(async error => {
    await protocol.revoke(next.refreshToken).catch(() => false);
    throw error;
  });
  if (!updated.length) {
    await protocol.revoke(next.refreshToken).catch(() => false);
    throw new ChatGPTError("conflict");
  }
  return { credentials: next, version: updated[0].version };
}

export async function markReconnect(user: SessionUser, version: number) {
  browserOnly(user);
  await withUser(user, tx => tx`update app.chatgpt_connections set status = 'reconnect_required', checked_at = null,
    version = version + 1 where owner_id = ${user.id} and version = ${version}`);
}
export async function beginAccessCheck(user: SessionUser, version: number) {
  browserOnly(user);
  const lease = randomUUID();
  const rows = await withUser(user, tx => tx`update app.chatgpt_connections set check_lease = ${lease}, check_started_at = now()
    where owner_id = ${user.id} and version = ${version} and status = 'connected'
      and (check_lease is null or check_started_at < now() - interval '60 seconds')
      and (check_started_at is null or check_started_at < now() - interval '30 seconds') returning owner_id`);
  if (!rows.length) throw new ChatGPTError("busy");
  return lease;
}
export async function endAccessCheck(user: SessionUser, lease: string) {
  browserOnly(user);
  await withUser(user, tx => tx`update app.chatgpt_connections set check_lease = null where owner_id = ${user.id} and check_lease = ${lease}`);
}
export async function markChecked(user: SessionUser, version: number, lease: string) {
  browserOnly(user);
  const rows = await withUser(user, tx => tx`update app.chatgpt_connections set checked_at = now()
    where owner_id = ${user.id} and version = ${version} and status = 'connected' and check_lease = ${lease} returning owner_id`);
  if (!rows.length) throw new ChatGPTError("conflict");
}

export async function disconnectConnection(user: SessionUser) {
  browserOnly(user);
  const row = await withUser(user, async tx => {
    const [old] = await tx<ConnectionRow[]>`select * from app.chatgpt_connections where owner_id = ${user.id} for update`;
    await tx`delete from app.chatgpt_transactions where owner_id = ${user.id}`;
    await tx`update app.chatgpt_connections set credentials = null, subject = null, email = null,
      status = 'disconnected', checked_at = null, refresh_lease = null, refresh_started_at = null, check_lease = null, check_started_at = null,
      version = version + 1, updated_at = now() where owner_id = ${user.id}`;
    return old;
  });
  if (!row?.credentials) return { revoked: true };
  try {
    if (row.clientId !== connectionConfig(false).clientId) return { revoked: false };
    const credentials = unseal<Credentials>(row.credentials, user.id, "credentials");
    return { revoked: await protocol.revoke(credentials.refreshToken) };
  } catch { return { revoked: false }; }
}
