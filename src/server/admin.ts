import "server-only";
import { createClient } from "@supabase/supabase-js";
import { currentUser } from "@/server/auth";
import { withUser, type SessionUser } from "@/server/db";
import { EVIDENCE_BUCKET } from "@/server/storage";
import { ValidationError } from "@/server/validate";

/**
 * The Admin page's server side: add, pause and remove scholars.
 *
 * Two kinds of access, kept apart:
 *  - Reading the list and the activity log goes through the database as the signed-in admin
 *    (app.admin_scholars / app.admin_log refuse anyone who isn't in app.admins).
 *  - Creating, pausing and deleting accounts needs Supabase's secret key, which gets past every
 *    "own rows only" rule. It is read in this file only (a test checks), and only by functions
 *    that take an `Admin` — a value only `currentAdmin()` hands out, after asking the database.
 */

declare const adminBrand: unique symbol;
/** A signed-in person the database has just confirmed is an admin. */
export type Admin = SessionUser & { readonly [adminBrand]: true };

/**
 * The signed-in admin, or null for anyone else (signed out, not an admin, or a ChatGPT /
 * Codex connection — currentUser() only accepts website sessions). Asks the database every
 * time, so removing someone from app.admins takes effect on their next click.
 */
export async function currentAdmin(): Promise<Admin | null> {
  const user = await currentUser();
  if (!user) return null;
  const [row] = await withUser(user, (tx) => tx<{ ok: boolean }[]>`select app.is_admin() as ok`);
  return row?.ok ? (user as Admin) : null;
}

/** Whether accounts can be changed here: the secret key is set on the server. */
export function accountToolsReady() {
  return Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function secretClient(_admin: Admin) {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new ValidationError("Adding and removing accounts isn't switched on yet: the server needs SUPABASE_SECRET_KEY.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type Scholar = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  lastSignInAt: Date | null;
  bannedUntil: Date | null;
  onboarded: boolean;
  isAdmin: boolean;
};

export type ScholarStatus = "admin" | "paused" | "invited" | "active";

export function statusOf(s: Pick<Scholar, "isAdmin" | "bannedUntil" | "lastSignInAt">, now = new Date()): ScholarStatus {
  if (s.bannedUntil && new Date(s.bannedUntil) > now) return "paused";
  if (s.isAdmin) return "admin";
  return s.lastSignInAt ? "active" : "invited";
}

export async function listScholars(admin: Admin): Promise<Scholar[]> {
  return withUser(admin, (tx) => tx<Scholar[]>`select * from app.admin_scholars()`);
}

export type AdminEvent = { at: Date; actorEmail: string; action: "add" | "pause" | "resume" | "delete"; targetEmail: string };

export async function adminLog(admin: Admin, n = 30): Promise<AdminEvent[]> {
  return withUser(admin, (tx) => tx<AdminEvent[]>`select * from app.admin_log(${n})`);
}

/**
 * Log a change that has already happened. A failure here is reported in the server logs but
 * doesn't fail the action: telling the admin "try again" would make them repeat a done change.
 */
async function record(admin: Admin, action: AdminEvent["action"], targetEmail: string) {
  try {
    await withUser(admin, (tx) => tx`select app.record_admin_event(${action}, ${targetEmail})`);
  } catch (e) {
    console.error(`admin log failed (${action} ${targetEmail} by ${admin.email}):`, (e as Error).message);
  }
}

/** The account an action is about, checked against what the admin is allowed to change. */
async function changeable(admin: Admin, id: string): Promise<Scholar> {
  const s = (await listScholars(admin)).find((x) => x.id === id);
  if (!s) throw new ValidationError("That account no longer exists. Reload the page.");
  if (s.id === admin.id) throw new ValidationError("You can't do this to your own account.");
  if (s.isAdmin) throw new ValidationError("Admins can't be paused or deleted here. Remove their admin access first (in the database).");
  return s;
}

export function normaliseEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new ValidationError("Please enter a valid email address.");
  return email;
}

/** Create an account. Sign-up stays closed to the public; the new scholar then signs in as usual. */
export async function addScholar(admin: Admin, emailInput: unknown): Promise<{ email: string }> {
  const email = normaliseEmail(emailInput);
  const { error } = await secretClient(admin).auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    // Only "already registered" — other 422s (e.g. an address the auth server rejects) aren't duplicates.
    if (error.code === "email_exists" || /already (been )?registered/i.test(error.message)) throw new ValidationError("There's already an account for that email.");
    throw new Error(`createUser failed: ${error.status ?? ""} ${error.code ?? ""} ${error.message}`);
  }
  await record(admin, "add", email);
  return { email };
}

/**
 * Pause stops sign-in (and stops a signed-in session renewing, so it ends within the hour);
 * nothing is deleted. Resume undoes it.
 */
export async function setPaused(admin: Admin, id: string, paused: boolean): Promise<{ email: string }> {
  const s = await changeable(admin, id);
  const { error } = await secretClient(admin).auth.admin.updateUserById(id, { ban_duration: paused ? "876000h" : "none" });
  if (error) throw new Error(`updateUserById failed: ${error.status ?? ""} ${error.code ?? ""} ${error.message}`);
  await record(admin, paused ? "pause" : "resume", s.email);
  return { email: s.email };
}

/**
 * Delete an account for good: stored files first (storage has no link to accounts, so they'd
 * be left behind), then the account, which removes every record of theirs (each table
 * cascades from auth.users). The admin must have typed the account's email to confirm.
 */
export async function deleteScholar(admin: Admin, id: string, typedEmail: unknown): Promise<{ email: string; files: number }> {
  const s = await changeable(admin, id);
  if (typeof typedEmail !== "string" || typedEmail.trim().toLowerCase() !== s.email.toLowerCase()) {
    throw new ValidationError("Type their email exactly to confirm.");
  }
  const client = secretClient(admin);
  const storage = client.storage.from(EVIDENCE_BUCKET);

  async function listAll(prefix: string): Promise<string[]> {
    const out: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await storage.list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      for (const item of data) {
        const path = `${prefix}/${item.name}`;
        if (item.id === null) out.push(...(await listAll(path)));
        else out.push(path);
      }
      if (data.length < 1000) return out;
    }
  }

  const paths = await listAll(s.id);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await storage.remove(paths.slice(i, i + 100));
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
  const { error } = await client.auth.admin.deleteUser(s.id);
  if (error) throw new Error(`deleteUser failed: ${error.status ?? ""} ${error.code ?? ""} ${error.message}`);
  await record(admin, "delete", s.email);
  return { email: s.email, files: paths.length };
}
