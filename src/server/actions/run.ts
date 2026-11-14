import "server-only";
import { unstable_rethrow } from "next/navigation";
import { asUser } from "@/server/auth";
import { ConflictError, type SessionUser, type Tx } from "@/server/db";
import { fail, friendlyDbError, ok, type ActionResult } from "@/lib/result";

/** Run an action's database work as the user and turn failures into friendly results. */
export async function run<T>(fn: (tx: Tx, user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await asUser(fn));
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof ConflictError) return fail("conflict", e.message);
    if (e instanceof ValidationError) return fail("validation", e.message);
    return friendlyDbError(e);
  }
}

export class ValidationError extends Error {}

export function text(v: FormDataEntryValue | null | undefined, max = 5000): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s.length > max) throw new ValidationError(`Please keep this under ${max} characters.`);
  return s;
}

export function required(v: FormDataEntryValue | null | undefined, label: string, max = 300): string {
  const s = text(v, max);
  if (!s) throw new ValidationError(`${label} is required.`);
  return s;
}

export function uuidOrNull(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T | null = null): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function dateOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function creditsOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 999) throw new ValidationError("Credits must be a number.");
  return Math.round(n * 100) / 100;
}
