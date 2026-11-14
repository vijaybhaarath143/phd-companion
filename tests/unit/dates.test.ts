import { describe, expect, it } from "vitest";
import { formatPartialDate, isFuture, readPartialDate, todayIn, monthLabel } from "@/lib/dates";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe("partial dates never invent a day", () => {
  it("shows month-only dates without a day", () => {
    expect(formatPartialDate("2027-01-01", "month")).toBe("January 2027 · day not known");
    expect(formatPartialDate("2027-01-01", "month")).not.toContain("1 Jan");
  });

  it("shows exact dates and missing dates plainly", () => {
    expect(formatPartialDate("2026-11-14", "day")).toBe("14 Nov 2026");
    expect(formatPartialDate(null, "none")).toBe("No date yet");
    expect(formatPartialDate("2026-11-14", "none")).toBe("No date yet");
  });

  it("reads 'Month only' as the month, stored on the 1st", () => {
    expect(readPartialDate(form({ wPrecision: "month", wMonth: "2027-01" }), "w")).toEqual({ date: "2027-01-01", precision: "month" });
  });

  it("reads 'Not sure yet' as no date at all", () => {
    expect(readPartialDate(form({ wPrecision: "none", wDate: "2026-11-14" }), "w")).toEqual({ date: null, precision: "none" });
  });

  it("falls back to no date when the input is malformed", () => {
    expect(readPartialDate(form({ wPrecision: "day", wDate: "14/11/2026" }), "w")).toEqual({ date: null, precision: "none" });
    expect(readPartialDate(form({ wPrecision: "month", wMonth: "Jan 2027" }), "w")).toEqual({ date: null, precision: "none" });
  });

  it("only treats a month as future once the whole month is after today", () => {
    expect(isFuture("2027-01-01", "month", "2026-11-14")).toBe(true);
    expect(isFuture("2026-11-01", "month", "2026-11-14")).toBe(false); // this month: not "future"
    expect(isFuture("2026-11-15", "day", "2026-11-14")).toBe(true);
    expect(isFuture(null, "none", "2026-11-14")).toBe(false);
  });

  it("works out 'today' in the scholar's time zone, not the server's", () => {
    // 20:00 UTC on 14 Nov is already 15 Nov in India (UTC+5:30)
    const now = new Date("2026-11-14T20:00:00Z");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-11-15");
    expect(todayIn("UTC", now)).toBe("2026-11-14");
  });

  it("labels months", () => {
    expect(monthLabel("2026-06")).toBe("June 2026");
  });
});
