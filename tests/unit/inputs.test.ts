import { describe, expect, it } from "vitest";
import { isUuid, likePattern } from "@/lib/utils";
import { formatTimestamp, isMonthKey } from "@/lib/dates";
import { dateOrNull, uuidOrNull } from "@/server/validate";

describe("what arrives in addresses and forms", () => {
  it("accepts only real UUIDs (not 36 dashes)", () => {
    expect(isUuid("6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("-".repeat(36))).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(uuidOrNull("0".repeat(36))).toBeNull();
  });

  it("accepts only real months and days", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(dateOrNull("2026-02-30")).toBeNull();
    expect(dateOrNull("2028-02-29")).toBe("2028-02-29");
  });

  it("searches for % and _ literally", () => {
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b\\c")).toBe("%a\\_b\\\\c%");
  });
});

describe("timestamps are shown on her own clock", () => {
  it("formats in the profile's time zone, not the server's (UTC)", () => {
    const late = new Date("2026-11-13T20:00:00Z"); // 01:30 on 14 Nov in India
    expect(formatTimestamp(late, "Asia/Kolkata")).toBe("14 Nov 2026");
    expect(formatTimestamp(late, "UTC")).toBe("13 Nov 2026");
    expect(formatTimestamp(late, "Asia/Kolkata", { time: true })).toBe("14 Nov 2026, 01:30");
  });
});
