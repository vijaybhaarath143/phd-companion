/**
 * One CSV cell. Values that a spreadsheet would treat as a formula
 * (starting with = + - @ or a tab/CR) get a leading apostrophe so they open as text.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  // plain numbers (including negative ones like -5 or -0.25) stay numbers
  const isNumber = typeof v === "number" || /^-\d+(\.\d+)?$/.test(s);
  if (!isNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  // BOM so Excel reads UTF-8 (em dashes, non-Latin names) correctly
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
}
