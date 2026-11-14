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

export type SessionUser = { id: string; email: string };

export async function withUser<T>(user: SessionUser, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: user.id, role: "authenticated", email: user.email });
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

export class ConflictError extends Error {
  constructor() {
    super("This was changed somewhere else (another tab or device).");
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
