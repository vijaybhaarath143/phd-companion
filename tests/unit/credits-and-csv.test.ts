import { describe, expect, it } from "vitest";
import { describeBucket, summariseCredits } from "@/lib/credits";
import { csvCell, toCsv } from "@/lib/csv";

describe("credit accounting", () => {
  it("never counts an unknown credit value as zero", () => {
    const s = summariseCredits(12, [{ status: "enrolled", credits: null, recognised: 0 }]);
    expect(s.incomplete).toBe(true);
    expect(describeBucket(s.enrolled)).toEqual({ value: "—", note: "1 course, credits not recorded" });
  });

  it("keeps completed and officially recognised separate", () => {
    const s = summariseCredits(12, [
      { status: "completed", credits: 4, recognised: 2 },
      { status: "completed", credits: 2, recognised: 0 },
    ]);
    expect(s.completed.known).toBe(6);
    expect(s.recognised).toBe(2); // not 8: the two are never added
    expect(s.incomplete).toBe(false);
  });

  it("shows a known subtotal plus courses with missing values", () => {
    const s = summariseCredits(null, [
      { status: "enrolled", credits: 3, recognised: 0 },
      { status: "enrolled", credits: null, recognised: 0 },
    ]);
    expect(describeBucket(s.enrolled)).toEqual({ value: "3", note: "+ 1 course with credits not recorded" });
    expect(s.required).toBeNull();
  });

  it("ignores dropped courses when deciding if totals are incomplete", () => {
    const s = summariseCredits(12, [{ status: "dropped", credits: null, recognised: 0 }]);
    expect(s.incomplete).toBe(false);
  });
});

describe("CSV export is safe to open in a spreadsheet", () => {
  it("neutralises values that look like formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@sum")).toBe("'@sum");
  });

  it("quotes commas, quotes and new lines", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it("writes empty cells for missing values and a header row", () => {
    const csv = toCsv([{ title: "SLR 1", credits: null }]);
    expect(csv.startsWith("﻿title,credits\r\n")).toBe(true);
    expect(csv.endsWith("SLR 1,")).toBe(true);
  });
});
