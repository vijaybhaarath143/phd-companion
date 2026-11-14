import { monthNames } from "@/lib/dates";

/** One choice in a select. Plain data, so Server Components can build these too. */
export type SelectOption = { value: string; label: string };

/** Options from a `{ value: label }` map, optionally led by an empty choice ("Any", "Not set"…). */
export function toOptions(labels: Record<string, string>, empty?: string): SelectOption[] {
  const list = Object.entries(labels).map(([value, label]) => ({ value, label }));
  return empty === undefined ? list : [{ value: "", label: empty }, ...list];
}

/** Options from rows with an id, optionally led by an empty choice. */
export function rowOptions<T extends { id: string }>(rows: T[], label: (row: T) => string, empty?: string): SelectOption[] {
  const list = rows.map((r) => ({ value: r.id, label: label(r) }));
  return empty === undefined ? list : [{ value: "", label: empty }, ...list];
}

/** The twelve months as "01".."12", optionally led by an empty choice. */
export function monthOptions(empty?: string, short = false): SelectOption[] {
  const list = monthNames.map((m, i) => ({ value: String(i + 1).padStart(2, "0"), label: short ? m.slice(0, 3) : m }));
  return empty === undefined ? list : [{ value: "", label: empty }, ...list];
}

/** Plain values that are their own labels (years, time zones…). */
export function valueOptions(values: (string | number)[], empty?: string, label: (v: string) => string = (v) => v): SelectOption[] {
  const list = values.map((v) => ({ value: String(v), label: label(String(v)) }));
  return empty === undefined ? list : [{ value: "", label: empty }, ...list];
}
