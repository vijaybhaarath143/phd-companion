import { lastPurge, ping } from "@/server/db";

/**
 * Public liveness check: is the app up, can it reach the database, and did the nightly
 * Trash job last succeed? No user data.
 */
export async function GET() {
  const db = await ping();
  const purge = db ? await lastPurge() : null;
  const trashJob = purge ? (purge.status === "succeeded" ? "ok" : "failing") : "not run yet";
  if (purge && purge.status !== "succeeded") console.error("purge-trash last run:", purge.status, purge.at);
  return Response.json({ ok: db, db, trashJob }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
