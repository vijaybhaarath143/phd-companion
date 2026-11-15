"use server";

import { revalidatePath } from "next/cache";
import { asUser } from "@/server/auth";
import { authAdmin } from "@/server/admin/auth-admin";
import { adminConfigured } from "@/server/admin/configured";
import { temporaryPassword } from "@/server/admin/temp-password";
import { fail, friendlyDbError, ok, type ActionResult } from "@/lib/result";
import { normaliseUsername, PLACEHOLDER_EMAIL_DOMAIN, USERNAME_HINT, USERNAME_RULE } from "@/lib/passwords";
import { unstable_rethrow } from "next/navigation";

/**
 * Platform-admin actions. Each one first asks the DATABASE whether the signed-in person
 * is a platform admin (app.require_platform_admin, via the admin_* functions) before it
 * touches Supabase's account API, and every change is written to app.audit_log.
 */

const NOT_ADMIN = "Only the platform admin can do this.";
const NOT_CONFIGURED = "Account management isn't switched on: SUPABASE_SECRET_KEY is not set on the server.";

class AdminRefused extends Error {}

/** Confirm in the database that the caller is a platform admin. */
async function requireAdmin(): Promise<void> {
  const allowed = await asUser(async (tx) => {
    const [{ admin }] = await tx<{ admin: boolean }[]>`select app.is_platform_admin() as admin`;
    return admin;
  });
  if (!allowed) throw new AdminRefused(NOT_ADMIN);
  if (!adminConfigured()) throw new AdminRefused(NOT_CONFIGURED);
}

async function guarded<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireAdmin();
    const data = await fn();
    revalidatePath("/admin");
    return ok(data);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AdminRefused) return fail("validation", e.message);
    const err = e as { code?: string; message?: string };
    if (err?.code === "42501") return fail("validation", NOT_ADMIN);
    if (err?.code === "23505") return fail("validation", "That username is already taken.");
    if (err?.code === "23514" && err.message && !err.message.includes("violates check constraint")) return fail("validation", err.message);
    return friendlyDbError(e);
  }
}

function uuid(v: unknown): string {
  const s = String(v ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new AdminRefused("That account wasn't found.");
  return s;
}

function username(v: unknown): string {
  const u = normaliseUsername(v);
  if (!USERNAME_RULE.test(u)) throw new AdminRefused(`Username: ${USERNAME_HINT}`);
  return u;
}

export type CreatedPerson = { username: string; password: string; name: string };

/** Add a person: a sign-in account with a temporary password they must change. */
export async function createPerson(form: FormData): Promise<ActionResult<CreatedPerson>> {
  return guarded(async () => {
    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new AdminRefused("Enter their name.");
    if (name.length > 120) throw new AdminRefused("Keep the name under 120 characters.");
    const user = username(form.get("username"));
    const rawEmail = String(form.get("email") ?? "").trim().toLowerCase();
    if (rawEmail && (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail) || rawEmail.length > 254)) throw new AdminRefused("That email address doesn't look right.");
    const makeAdmin = form.get("admin") === "on";

    const free = await asUser(async (tx) => {
      const [{ free }] = await tx<{ free: boolean }[]>`select app.admin_username_free(${user}) as free`;
      return free;
    });
    if (!free) throw new AdminRefused("That username is already taken.");

    const password = temporaryPassword();
    const email = rawEmail || `${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    const { data, error } = await authAdmin().createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      if (error?.code === "email_exists" || /already/i.test(error?.message ?? "")) {
        throw new AdminRefused("There's already an account with that email. Give it a username from its row instead.");
      }
      throw error ?? new Error("createUser returned no user");
    }
    try {
      await asUser((tx) => tx`select app.admin_create_profile(${data.user.id}, ${user}, ${name}, ${makeAdmin})`);
    } catch (e) {
      // don't leave a sign-in account behind without its profile
      await authAdmin().deleteUser(data.user.id);
      throw e;
    }
    return { username: user, password, name };
  });
}

/** Give an existing account a username, so it can also sign in with a password. */
export async function setUsername(userId: string, value: string): Promise<ActionResult<undefined>> {
  return guarded(async () => {
    const id = uuid(userId);
    const user = username(value);
    await asUser((tx) => tx`select app.admin_set_username(${id}, ${user})`);
    return undefined;
  });
}

/** Set a new temporary password; they choose their own at next sign-in. */
export async function resetPassword(userId: string): Promise<ActionResult<{ password: string }>> {
  return guarded(async () => {
    const id = uuid(userId);
    const password = temporaryPassword();
    const { error } = await authAdmin().updateUserById(id, { password });
    if (error) throw error;
    await asUser((tx) => tx`select app.admin_password_reset(${id})`);
    return { password };
  });
}

/** Suspend (signed out everywhere, can't sign in) or reactivate an account. */
export async function setSuspended(userId: string, suspended: boolean): Promise<ActionResult<undefined>> {
  return guarded(async () => {
    const id = uuid(userId);
    // the database refuses suspending yourself, so it goes first
    await asUser((tx) => tx`select app.admin_set_status(${id}, ${suspended ? "suspended" : "active"})`);
    const { error } = await authAdmin().updateUserById(id, { ban_duration: suspended ? "876000h" : "none" });
    if (error) {
      // keep the two in step: undo the status change if the sign-in block didn't take
      await asUser((tx) => tx`select app.admin_set_status(${id}, ${suspended ? "active" : "suspended"})`);
      throw error;
    }
    return undefined;
  });
}

export async function setPlatformAdmin(userId: string, admin: boolean): Promise<ActionResult<undefined>> {
  return guarded(async () => {
    const id = uuid(userId);
    await asUser((tx) => tx`select app.admin_set_platform_admin(${id}, ${admin})`);
    return undefined;
  });
}
