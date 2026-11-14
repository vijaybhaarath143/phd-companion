/** Checks for what people (or assistants) send in. Shared by server actions and the MCP connector. */

import { isUuid } from "@/lib/utils";

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
  return isUuid(v) ? v : null;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T | null = null): T | null {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function dateOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  return real.getUTCFullYear() === y && real.getUTCMonth() === m - 1 && real.getUTCDate() === d ? v : null;
}

/** The version a form was showing, so a save can't silently overwrite a newer change. */
export function versionOf(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError("Something went wrong — please reload the page and try again.");
  return n;
}

export function creditsOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 999) throw new ValidationError("Credits must be a number.");
  return Math.round(n * 100) / 100;
}
