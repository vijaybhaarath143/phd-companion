import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { extractText, MAX_TEXT_CHARS, slice, UnreadableFile } from "@/server/mcp/extract";
import { sniff } from "@/lib/files";
import { makeDocx, makePdf, makePptx, makeXlsx } from "./fixtures";

describe("reading a file's text for an assistant", () => {
  it("reads PDF text", async () => {
    const pdf = makePdf("Cyclic voltammetry results");
    expect(sniff(pdf, "r.pdf")).toBe("application/pdf");
    const out = await extractText(pdf, "r.pdf");
    expect(out.text).toContain("Page 1");
    expect(out.text).toContain("Cyclic voltammetry results");
  });

  it("reads Word text", async () => {
    const out = await extractText(makeDocx(["Guide comments", "Rewrite the methods section"]), "c.docx");
    expect(out.text).toContain("Guide comments");
    expect(out.text).toContain("Rewrite the methods section");
  });

  it("reads spreadsheet rows, tab-separated, with the sheet name", async () => {
    const out = await extractText(makeXlsx([["Sample", "Current"], ["A1", 0.42]]), "data.xlsx");
    expect(out.text).toContain("Sheet: Results");
    expect(out.text).toContain("Sample\tCurrent");
    expect(out.text).toContain("A1\t0.42");
  });

  it("reads slide text in slide order", async () => {
    const out = await extractText(makePptx([["Title slide"], ["Findings &amp; next steps", "Second line"]]), "talk.pptx");
    expect(out.text.indexOf("Slide 1")).toBeLessThan(out.text.indexOf("Slide 2"));
    expect(out.text).toContain("Findings & next steps\nSecond line");
  });

  it("reads CSV and text files as they are", async () => {
    expect((await extractText(strToU8("a,b\n1,2"), "x.csv")).text).toBe("a,b\n1,2");
    expect((await extractText(strToU8("hello"), "x.txt")).text).toBe("hello");
  });

  it("explains that images have no text", async () => {
    await expect(extractText(new Uint8Array([0x89, 0x50]), "photo.png")).rejects.toBeInstanceOf(UnreadableFile);
  });

  it("caps each part and says where the next part starts", () => {
    const long = "x".repeat(MAX_TEXT_CHARS + 10);
    const first = slice("Text", long);
    expect(first.text.length).toBe(MAX_TEXT_CHARS);
    expect(first.nextStart).toBe(MAX_TEXT_CHARS);
    const second = slice("Text", long, first.nextStart!);
    expect(second.text.length).toBe(10);
    expect(second.nextStart).toBeNull();
    expect(slice("Text", "abc", 99).text).toBe("");
  });
});
