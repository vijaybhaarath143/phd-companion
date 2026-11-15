import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountSuspendedError, loginEmailFor, signInLimits, type SessionUser, type Tx } from "@/server/db";
import { admin, dropUser, makeUser, refused, withUser } from "./helpers";

/**
 * Accounts (docs/platform-admin-and-collaboration-plan.md, phase 1): only a platform admin
 * manages accounts, being admin never opens anyone's research, people can't change their
 * own account fields, and a suspended account is shut out at once.
 */

let boss: SessionUser; // platform admin
let deepika: SessionUser; // an ordinary account
let other: SessionUser;

beforeAll(async () => {
  boss = await makeUser("boss");
  deepika = await makeUser("deepika");
  other = await makeUser("other");
  await admin`insert into app.platform_roles (user_id) values (${boss.id})`;
  await withUser(boss, (tx) => tx`insert into public.profiles (user_id, display_name, onboarded_at) values (auth.uid(), 'Boss', now())`);
  await withUser(deepika, async (tx) => {
    await tx`insert into public.profiles (user_id, display_name, onboarded_at) values (auth.uid(), 'Deepika', now())`;
    await tx`insert into public.manuscripts (title) values ('Deepika secret manuscript')`;
  });
});

afterAll(async () => {
  // the shared local database keeps no audit rows from test accounts
  const ids = [boss.id, deepika.id, other.id];
  await admin`delete from app.audit_log where actor_id = any(${ids}::uuid[]) or subject_user_id = any(${ids}::uuid[])`;
  for (const u of [boss, deepika, other]) await dropUser(u);
  await admin.end();
});

const isAdmin = (u: SessionUser) => withUser(u, async (tx) => (await tx<{ a: boolean }[]>`select app.is_platform_admin() as a`)[0].a);

describe("platform admin", () => {
  it("knows who is admin", async () => {
    expect(await isAdmin(boss)).toBe(true);
    expect(await isAdmin(deepika)).toBe(false);
  });

  it("refuses every admin function to anyone else", async () => {
    const calls = [
      (tx: Tx) => tx`select * from app.admin_list_users()`,
      (tx: Tx) => tx`select app.admin_username_free('x-y-z')`,
      (tx: Tx) => tx`select app.admin_set_username(${other.id}, 'hijack')`,
      (tx: Tx) => tx`select app.admin_password_reset(${other.id})`,
      (tx: Tx) => tx`select app.admin_set_status(${other.id}, 'suspended')`,
      (tx: Tx) => tx`select app.admin_set_platform_admin(auth.uid(), true)`,
      (tx: Tx) => tx`select * from app.admin_audit_log()`,
    ];
    for (const call of calls) expect(await refused(deepika, call)).toMatch(/platform admin/);
  });

  it("can't be granted by writing the table directly", async () => {
    await refused(deepika, (tx) => tx`insert into app.platform_roles (user_id) values (auth.uid())`);
    await refused(deepika, (tx) => tx`select * from app.audit_log`);
    await refused(deepika, (tx) => tx`select * from app.platform_roles`);
  });

  it("lists accounts but sees none of their research", async () => {
    const people = await withUser(boss, (tx) => tx<{ userId: string; displayName: string | null }[]>`select * from app.admin_list_users()`);
    const d = people.find((p) => p.userId === deepika.id);
    expect(d?.displayName).toBe("Deepika");
    // admin role opens nothing in the data tables
    const seen = await withUser(boss, (tx) => tx`select id from public.manuscripts where owner_id = ${deepika.id}`);
    expect(seen).toHaveLength(0);
    const profiles = await withUser(boss, (tx) => tx`select user_id from public.profiles where user_id = ${deepika.id}`);
    expect(profiles).toHaveLength(0);
  });

  it("can't remove its own admin role or suspend itself", async () => {
    expect(await refused(boss, (tx) => tx`select app.admin_set_platform_admin(auth.uid(), false)`)).toMatch(/own admin/);
    expect(await refused(boss, (tx) => tx`select app.admin_set_status(auth.uid(), 'suspended')`)).toMatch(/own account/);
  });

  it("records every change in the audit log", async () => {
    await withUser(boss, (tx) => tx`select app.admin_set_username(${deepika.id}, 'deepika-r')`);
    const log = await withUser(boss, (tx) => tx<{ action: string; subject: string }[]>`select action, subject from app.admin_audit_log(10)`);
    expect(log[0]).toMatchObject({ action: "user.username_set", subject: "Deepika" });
  });

  it("creates a profile for a new account that must choose a password", async () => {
    await withUser(boss, (tx) => tx`select app.admin_create_profile(${other.id}, 'Other.Person', 'Other', false)`);
    const [p] = await admin`select username, must_change_password, created_by from public.profiles where user_id = ${other.id}`;
    expect(p).toMatchObject({ username: "other.person", mustChangePassword: true, createdBy: boss.id });
    // a taken username is refused
    await refused(boss, (tx) => tx`select app.admin_set_username(${deepika.id}, 'other.person')`);
    expect(await withUser(boss, async (tx) => (await tx`select app.admin_username_free('OTHER.person') as f`)[0].f)).toBe(false);
  });

  it("rejects usernames that break the rule", async () => {
    for (const bad of ["ab", "has space", "-starts-with-dash", "x".repeat(33)]) {
      await refused(boss, (tx) => tx`select app.admin_set_username(${deepika.id}, ${bad})`);
    }
  });
});

describe("a person's own account fields", () => {
  it("can't be changed by that person", async () => {
    await refused(deepika, (tx) => tx`update public.profiles set username = 'mine' where user_id = auth.uid()`);
    await refused(deepika, (tx) => tx`update public.profiles set account_status = 'suspended' where user_id = auth.uid()`);
    await refused(deepika, (tx) => tx`update public.profiles set created_by = auth.uid() where user_id = auth.uid()`);
  });

  it("can't be set when creating one's own profile", async () => {
    const fresh = await makeUser("fresh");
    try {
      await refused(fresh, (tx) => tx`insert into public.profiles (user_id, username) values (auth.uid(), 'sneaky')`);
      await withUser(fresh, (tx) => tx`insert into public.profiles (user_id) values (auth.uid())`); // the normal onboarding insert still works
    } finally {
      await dropUser(fresh);
    }
  });

  it("lets a person clear, but not set, the choose-a-password flag", async () => {
    await withUser(other, (tx) => tx`update public.profiles set must_change_password = false where user_id = auth.uid()`);
    await refused(other, (tx) => tx`update public.profiles set must_change_password = true where user_id = auth.uid()`);
    // ordinary profile edits still work
    await withUser(other, (tx) => tx`update public.profiles set display_name = 'Other P' where user_id = auth.uid()`);
  });
});

describe("username sign-in lookup", () => {
  it("finds the email for a username, case-insensitively", async () => {
    expect(await loginEmailFor("Deepika-R")).toBe(deepika.email);
    expect(await loginEmailFor("nobody-here")).toBeNull();
  });

  it("can't be called with a signed-in token", async () => {
    await refused(deepika, (tx) => tx`select app.login_email('deepika-r')`);
  });
});

describe("suspension", () => {
  it("shuts the account out at once, and reactivating lets it back in", async () => {
    await admin`insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), ${deepika.id}, now(), now())`;
    await withUser(boss, (tx) => tx`select app.admin_set_status(${deepika.id}, 'suspended')`);

    await expect(withUser(deepika, (tx) => tx`select 1`)).rejects.toBeInstanceOf(AccountSuspendedError);
    // stored files are reached with her own token, outside withUser: their policies refuse too
    const [files] = await admin.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: deepika.id, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return tx`select app.connector_ok() as ok`;
    });
    expect(files.ok).toBe(false);
    expect(await loginEmailFor("deepika-r")).toBeNull();
    expect(await admin`select id from auth.sessions where user_id = ${deepika.id}`).toHaveLength(0);

    await withUser(boss, (tx) => tx`select app.admin_set_status(${deepika.id}, 'active')`);
    const [row] = await withUser(deepika, (tx) => tx`select count(*)::int as n from public.manuscripts`);
    expect(row.n).toBe(1);
  });
});

describe("failed password sign-ins", () => {
  const account = `account-${crypto.randomUUID()}`;
  const ip = `ip-${crypto.randomUUID()}`;
  afterAll(async () => {
    await admin`delete from app.sign_in_failures where key in (${account}, ${ip}) or key like 'other-account-%'`;
  });

  it("pause an account after 10 failures in 15 minutes, until a success clears them", async () => {
    for (let i = 0; i < 9; i++) await signInLimits.failed(account, null);
    expect(await signInLimits.blocked(account, null)).toBe(false);
    await signInLimits.failed(account, null);
    expect(await signInLimits.blocked(account, null)).toBe(true);
    await signInLimits.succeeded(account);
    expect(await signInLimits.blocked(account, null)).toBe(false);
  });

  it("pause an address after 30 failures across accounts", async () => {
    for (let i = 0; i < 30; i++) await signInLimits.failed(`other-account-${i}`, ip);
    expect(await signInLimits.blocked(`other-account-new`, ip)).toBe(true);
    expect(await signInLimits.blocked(`other-account-new`, null)).toBe(false);
  });

  it("forget failures older than 15 minutes", async () => {
    await admin`update app.sign_in_failures set at = now() - interval '16 minutes' where key like 'other-account-%' or key = ${ip}`;
    expect(await signInLimits.blocked(`other-account-new`, ip)).toBe(false);
  });

  it("can't be read or reset with a signed-in token", async () => {
    await refused(deepika, (tx) => tx`select app.sign_in_blocked('x', null)`);
    await refused(deepika, (tx) => tx`select app.clear_sign_in_failures('x')`);
    await refused(deepika, (tx) => tx`select * from app.sign_in_failures`);
  });
});

describe("a deleted account", () => {
  it("is refused at once, though its token would still verify", async () => {
    const gone = await makeUser("gone");
    await withUser(gone, (tx) => tx`select 1`);
    await dropUser(gone);
    await expect(withUser(gone, (tx) => tx`select 1`)).rejects.toBeInstanceOf(AccountSuspendedError);
  });
});
