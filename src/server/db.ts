import "server-only";
import postgres from "postgres";

/**
 * One connection pool for the app. Every query from app code must go through
 * `withUser`, which runs it inside a transaction as the signed-in user so that
 * Postgres row-level security applies — exactly as it would for the browser.
 */
type Sql = ReturnType<typeof postgres>;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __sql?: Sql };

const sql: Sql =
  globalForDb.__sql ??
  postgres(process.env.DATABASE_URL!, {
    max: 5,
    // the hosted database is reached over TLS; the local Docker one isn't
    ssl: /@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? "") ? false : "require",
    prepare: false,
    // snake_case columns ⇄ camelCase in TypeScript
    transform: postgres.camel,
    types: {
      // Calendar dates stay plain "YYYY-MM-DD" strings — never shifted by time zones.
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
      // numeric → number (credits are small, two decimals)
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForDb.__sql = sql;

/**
 * `clientId` / `sessionId` are set only for requests from a connected assistant
 * (ChatGPT, Codex — see src/server/mcp). The database uses them to label what the
 * assistant adds or changes, and to check the connection hasn't been removed.
 */
export type SessionUser = { id: string; email: string; clientId?: string; sessionId?: string };

export async function withUser<T>(user: SessionUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({
    sub: user.id,
    role: "authenticated",
    email: user.email,
    ...(user.clientId ? { client_id: user.clientId, session_id: user.sessionId } : {}),
  });
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    // A suspended account is refused everywhere at once — website and connected
    // assistants — even while a token it was given earlier hasn't expired yet.
    const [{ active }] = await tx<{ active: boolean }[]>`select app.account_active() as active`;
    if (!active) throw new AccountSuspendedError();
    return fn(tx);
  }) as Promise<T>;
}

export class AccountSuspendedError extends Error {
  constructor() {
    super("This account is suspended.");
  }
}

/**
 * The email to sign in with for a username, or null. Runs before anyone is signed in,
 * with the server's own database role (the function can't be called with a user token).
 */
export async function loginEmailFor(username: string): Promise<string | null> {
  const [row] = await sql<{ email: string | null }[]>`select app.login_email(${username}) as email`;
  return row?.email ?? null;
}

/**
 * Failed password sign-ins, counted by the app: Supabase sees only the server's address for
 * sign-ins made here, so its own per-address limit can't tell people apart. Keys are hashes.
 */
export const signInLimits = {
  async blocked(account: string, ip: string | null): Promise<boolean> {
    const [row] = await sql<{ blocked: boolean }[]>`select app.sign_in_blocked(${account}, ${ip}) as blocked`;
    return row?.blocked ?? false;
  },
  async failed(account: string, ip: string | null): Promise<void> {
    await sql`select app.record_sign_in_failure(${account}, ${ip})`;
  },
  async succeeded(account: string): Promise<void> {
    await sql`select app.clear_sign_in_failures(${account})`;
  },
};

export class ConflictError extends Error {
  constructor() {
    super("This was changed somewhere else (another tab or device).");
  }
}

/**
 * How the nightly Trash purge last went (pg_cron keeps its own log), so a stuck job shows
 * up in /api/health instead of failing silently. Null when it hasn't run yet.
 */
export async function lastPurge(): Promise<{ status: string; at: string; job: string } | null> {
  try {
    // the latest run of each nightly clean-up job; a failure of either one counts
    const runs = await sql<{ jobname: string; status: string; at: Date }[]>`
      select distinct on (j.jobname) j.jobname, d.status, d.start_time as at
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname in ('purge-trash', 'purge-notes-and-trials')
      order by j.jobname, d.start_time desc`;
    if (!runs.length) return null;
    const failed = runs.find((r) => r.status !== "succeeded");
    const r = failed ?? runs.reduce((a, b) => (a.at > b.at ? a : b));
    return { status: r.status, at: new Date(r.at).toISOString(), job: r.jobname };
  } catch {
    return null;
  }
}

/** Liveness check for /api/health — touches no user data. */
export async function ping(): Promise<boolean> {
  try {
    await sql`select 1`;
    return true;
  } catch (e) {
    // Log only the error code and message (never the connection string) so a bad
    // DATABASE_URL on the host can be diagnosed from its logs.
    const err = e as { code?: string; message?: string };
    console.error("db ping failed:", err.code ?? "", err.message ?? "");
    return false;
  }
}
