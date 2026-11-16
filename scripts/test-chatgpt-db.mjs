/** A disposable Postgres 17 test harness. Never reads or resets the app database. */
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";

const container = `phd-chatgpt-test-${process.pid}`;
const docker = (...args) => {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Docker command failed");
  return result.stdout.trim();
};
let admin;
try {
  docker("run", "--rm", "--detach", "--name", container, "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
    "--publish", "127.0.0.1::5432", "postgres:17-alpine");
  const address = docker("port", container, "5432/tcp");
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Expected a localhost-only ephemeral port");
  const url = `postgres://postgres@${address}/postgres`;
  admin = postgres(url, { max: 1, connect_timeout: 2 });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { await admin`select 1`; ready = true; break; } catch { await setTimeout(250); }
  }
  if (!ready) throw new Error("Disposable Postgres did not become ready");
  // Minimal Supabase identity primitives; exercise the real migration, RLS and withUser.
  await admin.unsafe(`
    create role authenticated nologin;
    create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create schema app;
    grant usage on schema app to authenticated;
  `);
  await admin.unsafe(await readFile(new URL("../supabase/migrations/20261120000001_chatgpt_connection.sql", import.meta.url), "utf8"));
  const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/integration/chatgpt-connection.test.ts"], {
    stdio: "inherit", env: { ...process.env, DATABASE_URL: url, CHATGPT_TEST_DATABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "", SUPABASE_SECRET_KEY: "" },
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  if (admin) await admin.end({ timeout: 2 });
  spawnSync("docker", ["rm", "--force", "--volumes", container], { stdio: "ignore" });
}
