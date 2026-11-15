/**
 * Partial dates: a calendar date plus how precisely it is known.
 * "month" dates are stored as the 1st of the month but are never shown as the 1st.
 */
export type Precision = "day" | "month" | "none";
export type PartialDate = { date: string | null; precision: Precision };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = MONTHS.map((m) => m.slice(0, 3));

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** "14 Nov 2026" · "January 2027 · day not known" · "No date yet" */
export function formatPartialDate(date: string | null, precision: Precision, opts: { short?: boolean } = {}) {
  if (precision === "none" || !date) return "No date yet";
  const { y, m, d } = parts(date);
  if (precision === "month") return opts.short ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y} · day not known`;
  return `${d} ${MON[m - 1]} ${y}`;
}

export function formatDay(date: string) {
  const { m, d } = parts(date);
  return `${d} ${MON[m - 1]}`;
}

export function formatFullDay(date: string) {
  const { y, m, d } = parts(date);
  return `${d} ${MON[m - 1]} ${y}`;
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export const monthNames = MONTHS;

/** Today's calendar date in the scholar's time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "Saturday, 14 November 2026" in the scholar's time zone. */
export function longToday(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
}

export function greeting(timeZone: string, now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * A stored moment (created, recorded, deleted…) as she'd read it on her own clock:
 * "14 Nov 2026" or "14 Nov 2026, 09:30". Format on the server and pass the text to
 * client components, so the page reads the same before and after it loads.
 */
export function formatTimestamp(ts: Date | string, timeZone: string, opts: { time?: boolean; year?: boolean } = {}) {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(opts.year === false ? {} : { year: "numeric" }),
    ...(opts.time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).format(d);
}

/** "2026-11" — a real month (01–12), as used in links and filters. */
export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/**
 * Read a partial date from form fields named `${prefix}Precision`, `${prefix}Date` (YYYY-MM-DD)
 * and `${prefix}Month` (YYYY-MM). Never invents a day.
 */
export function readPartialDate(form: FormData, prefix: string): PartialDate {
  const precision = (form.get(`${prefix}Precision`) as Precision) || "none";
  if (precision === "day") {
    const date = String(form.get(`${prefix}Date`) || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date, precision } : { date: null, precision: "none" };
  }
  if (precision === "month") {
    const month = String(form.get(`${prefix}Month`) || "");
    return isMonthKey(month) ? { date: `${month}-01`, precision } : { date: null, precision: "none" };
  }
  return { date: null, precision: "none" };
}

/** Is this partial date in the future relative to today (whole period after today)? */
export function isFuture(date: string | null, precision: Precision, today: string) {
  if (!date || precision === "none") return false;
  if (precision === "day") return date > today;
  return monthKey(date) > monthKey(today);
}

/** A month key moved by some months: shiftMonth("2026-11", 2) → "2027-01". */
export function shiftMonth(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}
