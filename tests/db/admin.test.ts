import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/db";
import { addScholar, deleteScholar, listScholars, setPaused, adminLog, type Admin } from "@/server/admin";
import { EVIDENCE_BUCKET } from "@/server/storage";
import { admin as superuser, dropUser, makeUser, refused, withUser } from "./helpers";

/**
 * The Admin page: who counts as an admin, what admins can see (accounts, never records), and
 * what adding, pausing and deleting an account does.
 */
let boss: SessionUser;
let otherAdmin: SessionUser;
let scholar: SessionUser;
const created: string[] = [];
const secret = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

beforeAll(async () => {
  boss = await makeUser("admin-boss");
  otherAdmin = await makeUser("admin-other");
  scholar = await makeUser("admin-scholar");
  await superuser`insert into app.admins (user_id) values (${boss.id}), (${otherAdmin.id})`;
});

afterAll(async () => {
  for (const u of [boss, otherAdmin, scholar]) await dropUser(u).catch(() => {});
  for (const email of created) {
    const [u] = await superuser`select id from auth.users where email = ${email}`;
    if (u) await secret.auth.admin.deleteUser(u.id);
  }
  await superuser`delete from app.admin_events where actor_email in (${boss.email}, ${otherAdmin.email})`;
  await superuser.end();
});

const asAdmin = () => boss as Admin;
const isAdmin = async (u: SessionUser) => (await withUser(u, (tx) => tx`select app.is_admin() as ok`))[0].ok;

describe("who is an admin", () => {
  it("only people in app.admins", async () => {
    expect(await isAdmin(boss)).toBe(true);
    expect(await isAdmin(scholar)).toBe(false);
  });

  it("nobody can make themselves an admin, or read who is one", async () => {
    expect(await refused(scholar, (tx) => tx`insert into app.admins (user_id) values (${scholar.id})`)).toMatch(/permission denied/);
    expect(await refused(scholar, (tx) => tx`select * from app.admins`)).toMatch(/permission denied/);
    expect(await refused(boss, (tx) => tx`insert into app.admins (user_id) values (${scholar.id})`)).toMatch(/permission denied/);
    expect(await refused(scholar, (tx) => tx`insert into app.admin_events (actor_email, action, target_email) values ('x', 'add', 'y@z.co')`)).toMatch(/permission denied/);
  });
});

describe("what a non-admin gets", () => {
  it("is refused the account list, the log and recording events", async () => {
    expect(await refused(scholar, (tx) => tx`select * from app.admin_scholars()`)).toMatch(/Only admins/);
    expect(await refused(scholar, (tx) => tx`select * from app.admin_log()`)).toMatch(/Only admins/);
    expect(await refused(scholar, (tx) => tx`select app.record_admin_event('delete', 'someone@x.co')`)).toMatch(/Only admins/);
  });
});

describe("what an admin sees", () => {
  it("accounts with name, dates and status, but never anyone's records", async () => {
    await withUser(scholar, (tx) => tx`insert into public.entries (title, entry_precision) values ('Private notes', 'none')`);
    const list = await listScholars(asAdmin());
    const row = list.find((s) => s.id === scholar.id)!;
    expect(row.email).toBe(scholar.email);
    expect(row.isAdmin).toBe(false);
    expect(list.find((s) => s.id === boss.id)!.isAdmin).toBe(true);
    // the "own rows only" rule still holds for an admin
    const seen = await withUser(boss, (tx) => tx`select 1 from public.entries where owner_id = ${scholar.id}`);
    expect(seen.length).toBe(0);
  });
});

describe("adding, pausing and deleting", () => {
  it("adds an account that can sign in, and refuses a duplicate or a bad email", async () => {
    const email = `added-${crypto.randomUUID().slice(0, 8)}@test.local`;
    created.push(email);
    await addScholar(asAdmin(), `  ${email.toUpperCase()} `);
    const [u] = await superuser`select email, email_confirmed_at from auth.users where email = ${email}`;
    expect(u.emailConfirmedAt).not.toBeNull();
    await expect(addScholar(asAdmin(), email)).rejects.toThrow(/already an account/);
    await expect(addScholar(asAdmin(), "not-an-email")).rejects.toThrow(/valid email/);
  });

  it("won't pause or delete yourself or another admin", async () => {
    await expect(setPaused(asAdmin(), boss.id, true)).rejects.toThrow(/your own account/);
    await expect(setPaused(asAdmin(), otherAdmin.id, true)).rejects.toThrow(/Admins can't/);
    await expect(deleteScholar(asAdmin(), otherAdmin.id, otherAdmin.email)).rejects.toThrow(/Admins can't/);
  });

  it("pauses and resumes", async () => {
    await setPaused(asAdmin(), scholar.id, true);
    let [u] = await superuser`select banned_until from auth.users where id = ${scholar.id}`;
    expect(new Date(u.bannedUntil).getTime()).toBeGreaterThan(Date.now());
    await setPaused(asAdmin(), scholar.id, false);
    [u] = await superuser`select banned_until from auth.users where id = ${scholar.id}`;
    expect(u.bannedUntil).toBeNull();
  });

  it("deletes only with the email typed, taking stored files and records with it", async () => {
    const path = `${scholar.id}/evidence/note.txt`;
    const up = await secret.storage.from(EVIDENCE_BUCKET).upload(path, new Blob(["hello"]), { contentType: "text/plain" });
    expect(up.error).toBeNull();

    await expect(deleteScholar(asAdmin(), scholar.id, "wrong@x.co")).rejects.toThrow(/Type their email/);
    expect((await superuser`select 1 from auth.users where id = ${scholar.id}`).length).toBe(1);

    const r = await deleteScholar(asAdmin(), scholar.id, scholar.email.toUpperCase());
    expect(r.files).toBe(1);
    expect((await superuser`select 1 from auth.users where id = ${scholar.id}`).length).toBe(0);
    expect((await superuser`select 1 from public.entries where owner_id = ${scholar.id}`).length).toBe(0);
    const left = await secret.storage.from(EVIDENCE_BUCKET).list(`${scholar.id}/evidence`);
    expect(left.data ?? []).toHaveLength(0);
  });

  it("logs every change, newest first", async () => {
    const log = await adminLog(asAdmin(), 10);
    const mine = log.filter((e) => e.actorEmail === boss.email).map((e) => `${e.action} ${e.targetEmail}`);
    expect(mine.slice(0, 3)).toEqual([`delete ${scholar.email}`, `resume ${scholar.email}`, `pause ${scholar.email}`]);
    expect(mine.some((m) => m.startsWith("add added-"))).toBe(true);
  });
});
