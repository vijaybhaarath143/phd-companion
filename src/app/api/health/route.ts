import { ping } from "@/server/db";

/** Public liveness check: is the app up and can it reach the database? No user data. */
export async function GET() {
  const db = await ping();
  return Response.json({ ok: db, db }, { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
