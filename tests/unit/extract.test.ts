import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { extractText, MAX_TEXT_CHARS, MAX_UNZIPPED_BYTES, MAX_ZIP_ENTRIES, slice, trimRows, unzipChecked, UnreadableFile } from "@/server/mcp/extract";
import { sniff } from "@/lib/files";
import { makeDocx, makeDocxWithManyEntries, makeEncryptedPdf, makePdf, makePptx, makeXlsx, withClaimedSize } from "./fixtures";

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

describe("files that can't or shouldn't be read in full", () => {
  const tooLarge = /too large to read here/;
  const damaged = /couldn't be read \(it may be damaged or password-protected\)/;

  it("refuses a small Office file that claims to unpack into far more than 50 MB, before unpacking it", async () => {
    const bomb = 3_000_000_000;
    await expect(extractText(withClaimedSize(makeDocx(["x"]), "word/document.xml", bomb), "a.docx")).rejects.toThrow(tooLarge);
    await expect(extractText(withClaimedSize(makeXlsx([["x"]]), "xl/worksheets/sheet1.xml", bomb), "a.xlsx")).rejects.toThrow(tooLarge);
    await expect(extractText(withClaimedSize(makePptx([["x"]]), "ppt/slides/slide1.xml", MAX_UNZIPPED_BYTES + 1), "a.pptx")).rejects.toThrow(tooLarge);
  });

  it("refuses an archive with too many parts", async () => {
    await expect(extractText(makeDocxWithManyEntries(MAX_ZIP_ENTRIES), "many.docx")).rejects.toThrow(tooLarge);
    // a normal number of parts is fine
    expect((await extractText(makeDocxWithManyEntries(20), "ok.docx")).text).toContain("Many parts");
  });

  it("never unpacks more than a part claims (a part that lies about its size can't grow)", () => {
    const lying = withClaimedSize(makeDocx(["A".repeat(5000)]), "word/document.xml", 100);
    expect(unzipChecked(lying)["word/document.xml"].length).toBe(100);
  });

  it("says a damaged or password-protected file couldn't be read (not 'try again')", async () => {
    const cases: [Uint8Array, string][] = [
      [strToU8("%PDF-1.4\nthis is not really a pdf\n%%EOF"), "broken.pdf"],
      [makePdf("hello").slice(0, 40), "cut.pdf"],
      [makeEncryptedPdf(), "locked.pdf"],
      [strToU8("PK\u0003\u0004 not a zip"), "broken.docx"],
      [strToU8("garbage"), "broken.xlsx"],
      [withClaimedSize(makeDocx(["A".repeat(5000)]), "word/document.xml", 100), "lying.docx"],
    ];
    for (const [bytes, name] of cases) {
      const e = await extractText(bytes, name).catch((err: unknown) => err);
      expect(e, name).toBeInstanceOf(UnreadableFile);
      expect((e as Error).message, name).toMatch(damaged);
    }
  });

  it("gives up on a PDF that takes too long", async () => {
    await expect(extractText(makePdf("slow"), "slow.pdf", 0, { pdfTimeBudgetMs: 0 })).rejects.toThrow(/too long/);
  });

  it("reads only as far as the part asked for", async () => {
    const slides = Array.from({ length: 30 }, (_, i) => [`Slide text ${i + 1} ` + "w".repeat(2000)]);
    const first = await extractText(makePptx(slides), "long.pptx");
    expect(first.text.length).toBe(MAX_TEXT_CHARS);
    expect(first.totalChars).toBeNull(); // not read to the end
    expect(first.nextStart).toBe(MAX_TEXT_CHARS);
    const rest = await extractText(makePptx(slides), "long.pptx", first.nextStart!);
    expect(rest.text).toContain("Slide text 30");
    expect(rest.nextStart).toBeNull();
    expect(rest.totalChars).toBeGreaterThan(MAX_TEXT_CHARS);
  });

  it("stops a spreadsheet at the row cap without parsing the rest", async () => {
    const rows = Array.from({ length: 2_010 }, (_, i) => [`row${i + 1}`, i]);
    const out = await extractText(makeXlsx(rows), "big.xlsx");
    expect(out.text).toContain("row2000\t1999");
    expect(out.text).not.toContain("row2001");
    expect(out.text).toContain("only the first 2,000 rows");
  });

  it("cuts worksheet XML after the row cap, keeping it well-formed", () => {
    const xml = `<worksheet><sheetData><row r="1"/><row r="2"><c/></row><row r="3"><c/></row><row r="4"><c/></row></sheetData><mergeCells/></worksheet>`;
    expect(trimRows(xml, 2)).toBe(`<worksheet><sheetData><row r="1"/><row r="2"><c/></row><row r="3"><c/></row></sheetData></worksheet>`);
    expect(trimRows(xml, 3)).toBeNull();
    expect(trimRows(`<x:worksheet><x:sheetData><x:row><x:c/></x:row><x:row/></x:sheetData></x:worksheet>`, 1)).toBe(`<x:worksheet><x:sheetData><x:row><x:c/></x:row></x:sheetData></x:worksheet>`);
  });
});
