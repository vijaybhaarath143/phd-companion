export { cn } from "cn"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A real UUID (not just 36 characters of hex and dashes). Safe to use in URLs, forms and SQL. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v)
}

/** Words for an ILIKE '%…%' search: % _ and \ match themselves, not "anything". */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
