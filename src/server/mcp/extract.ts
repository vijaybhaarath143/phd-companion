import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import { extensionOf } from "@/lib/files";

/** The most text one call returns. Longer files are read in parts with `start`. */
export const MAX_TEXT_CHARS = 40_000;
const MAX_PDF_PAGES = 300;
const MAX_ROWS_PER_SHEET = 2_000;

export type ExtractedText = {
  /** What kind of reading was done, in plain words. */
  format: string;
  text: string;
  /** Total characters available, so the assistant can ask for the next part. */
  totalChars: number;
  start: number;
  /** Where to start the next part, or null when this was the end. */
  nextStart: number | null;
};

/**
 * Turn an evidence file into plain text an assistant can read: PDF text, Word text,
 * spreadsheet rows (Excel/CSV), slide text (PowerPoint) or a text file. Images have no text.
 */
export async function extractText(bytes: Uint8Array, filename: string, start = 0): Promise<ExtractedText> {
  const ext = extensionOf(filename);
  const [format, full] = await (async (): Promise<[string, string]> => {
    switch (ext) {
      case "pdf": return ["PDF text", await pdfText(bytes)];
      case "docx": return ["Word document text", await docxText(bytes)];
      case "xlsx": return ["Spreadsheet rows (tab-separated)", await xlsxText(bytes)];
      case "pptx": return ["Slide text", pptxText(bytes)];
      case "csv": return ["CSV rows", new TextDecoder().decode(bytes)];
      case "txt": return ["Text", new TextDecoder().decode(bytes)];
      default: throw new UnreadableFile("This is an image — it has no text to read. Open it in the app to see it.");
    }
  })();
  return slice(format, full, start);
}

export class UnreadableFile extends Error {}

export function slice(format: string, full: string, start = 0): ExtractedText {
  const s = Math.max(0, Math.min(Math.floor(start), full.length));
  const end = Math.min(full.length, s + MAX_TEXT_CHARS);
  return { format, text: full.slice(s, end), totalChars: full.length, start: s, nextStart: end < full.length ? end : null };
}

async function pdfText(bytes: Uint8Array) {
  // The legacy build runs in Node. Loading the worker module up front lets pdf.js run it
  // in this process (no separate worker thread), and keeps it in the server bundle.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error -- the worker module ships without type declarations
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), // pdf.js takes ownership of the buffer
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    const n = Math.min(doc.numPages, MAX_PDF_PAGES);
    let chars = 0;
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str + (item.hasEOL ? "\n" : "");
      }
      pages.push(`--- Page ${i} ---\n${line.trim()}`);
      chars += line.length;
      if (chars > 2_000_000) break; // far more than anyone will page through
    }
    if (doc.numPages > n) pages.push(`--- (${doc.numPages - n} more pages not read) ---`);
    return pages.join("\n\n");
  } finally {
    await task.destroy();
  }
}

async function docxText(bytes: Uint8Array) {
  const mammoth = await import("mammoth");
  const out = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return out.value.replace(/\n{3,}/g, "\n\n").trim();
}

async function xlsxText(bytes: Uint8Array) {
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(Buffer.from(bytes));
  return sheets
    .map(({ sheet, data }) => {
      const rows = data.slice(0, MAX_ROWS_PER_SHEET).map((row) => row.map(cell).join("\t"));
      const more = data.length > MAX_ROWS_PER_SHEET ? `\n(${data.length - MAX_ROWS_PER_SHEET} more rows not read)` : "";
      return `--- Sheet: ${sheet} ---\n${rows.join("\n")}${more}`;
    })
    .join("\n\n");
}

function cell(v: unknown) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/[\t\n]+/g, " ");
}

/** Slide text from a .pptx: each slide's text runs, in slide order. */
export function pptxText(bytes: Uint8Array) {
  const files = unzipSync(bytes, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) && f.originalSize < 5_000_000 });
  const num = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
  return Object.keys(files)
    .sort((a, b) => num(a) - num(b))
    .map((name) => {
      const text = strFromU8(files[name])
        .split(/<\/a:p>/)
        .map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""))
        .filter((line) => line.trim())
        .join("\n");
      return `--- Slide ${num(name)} ---\n${text}`;
    })
    .join("\n\n");
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}
