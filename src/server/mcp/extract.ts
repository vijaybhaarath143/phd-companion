import "server-only";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { extensionOf } from "@/lib/files";

/** The most text one call returns. Longer files are read in parts with `start`. */
export const MAX_TEXT_CHARS = 40_000;
const MAX_PDF_PAGES = 300;
const MAX_ROWS_PER_SHEET = 2_000;

/**
 * Word, Excel and PowerPoint files are zip archives. A small file can unpack into gigabytes
 * (a "zip bomb"), so the archive's own table of contents is checked before anything is unpacked.
 */
export const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2_000;
/** Reading a PDF stops after this long (the endpoint itself has 60 seconds). */
export const PDF_TIME_BUDGET_MS = 35_000;

export const DAMAGED = "This file couldn't be read (it may be damaged or password-protected). Open it in the app instead.";

export type ExtractedText = {
  /** What kind of reading was done, in plain words. */
  format: string;
  text: string;
  /** Total characters available, or null when the file wasn't read to the end (only up to this part). */
  totalChars: number | null;
  start: number;
  /** Where to start the next part, or null when this was the end. */
  nextStart: number | null;
  /** Said when reading stopped early (time limit, page limit) — the rest wasn't read. */
  note?: string;
};

/** What an extractor read: the text so far, and whether it reached the end of the file. */
type Read = { text: string; complete: boolean; note?: string };

/**
 * Turn an evidence file into plain text an assistant can read: PDF text, Word text,
 * spreadsheet rows (Excel/CSV), slide text (PowerPoint) or a text file. Images have no text.
 * Damaged, password-protected and oversized files throw UnreadableFile with a plain reason.
 */
export async function extractText(
  bytes: Uint8Array,
  filename: string,
  start = 0,
  opts: { pdfTimeBudgetMs?: number } = {},
): Promise<ExtractedText> {
  const ext = extensionOf(filename);
  // Read only as far as this part needs (plus one character, to know whether more follows).
  const want = Math.max(0, Math.floor(start)) + MAX_TEXT_CHARS + 1;
  const [format, read] = await (async (): Promise<[string, Read]> => {
    try {
      switch (ext) {
        case "pdf": return ["PDF text", await pdfText(bytes, want, opts.pdfTimeBudgetMs ?? PDF_TIME_BUDGET_MS)];
        case "docx": return ["Word document text", await docxText(bytes)];
        case "xlsx": return ["Spreadsheet rows (tab-separated)", await xlsxText(bytes)];
        case "pptx": return ["Slide text", pptxRead(bytes, want)];
        case "csv": return ["CSV rows", { text: new TextDecoder().decode(bytes), complete: true }];
        case "txt": return ["Text", { text: new TextDecoder().decode(bytes), complete: true }];
        default: throw new UnreadableFile("This is an image — it has no text to read. Open it in the app to see it.");
      }
    } catch (e) {
      if (e instanceof UnreadableFile) throw e;
      throw new UnreadableFile(DAMAGED);
    }
  })();
  const out = slice(format, read.text, start);
  if (!read.complete) {
    out.totalChars = null;
    if (out.nextStart === null && !read.note) out.nextStart = out.start + out.text.length;
  }
  if (read.note) out.note = read.note;
  return out;
}

export class UnreadableFile extends Error {}

export function slice(format: string, full: string, start = 0): ExtractedText {
  const s = Math.max(0, Math.min(Math.floor(start), full.length));
  const end = Math.min(full.length, s + MAX_TEXT_CHARS);
  return { format, text: full.slice(s, end), totalChars: full.length, start: s, nextStart: end < full.length ? end : null };
}

// ---------------------------------------------------------------- zip archives (docx, xlsx, pptx)

/**
 * Check a zip's table of contents (entry count and declared unpacked sizes) without
 * unpacking anything, then unpack only the entries `keep` asks for. fflate never writes past
 * an entry's declared size, so a file that lies about its sizes can't grow beyond the check.
 */
export function unzipChecked(bytes: Uint8Array, keep: (name: string) => boolean = () => true) {
  let entries = 0;
  let total = 0;
  try {
    unzipSync(bytes, {
      filter: (f) => {
        entries += 1;
        total += f.originalSize;
        return false;
      },
    });
  } catch {
    throw new UnreadableFile(DAMAGED);
  }
  if (entries === 0) throw new UnreadableFile(DAMAGED);
  if (entries > MAX_ZIP_ENTRIES || total > MAX_UNZIPPED_BYTES) {
    throw new UnreadableFile(
      "This file is too large to read here once unpacked (over 50 MB of content). Open it in the app instead, or ask her for the part you need.",
    );
  }
  try {
    return unzipSync(bytes, { filter: (f) => keep(f.name) });
  } catch {
    throw new UnreadableFile(DAMAGED);
  }
}

/** Repack checked entries without compression, so the parsing library has nothing left to inflate. */
function repack(files: Record<string, Uint8Array>) {
  return zipSync(files, { level: 0 });
}

async function docxText(bytes: Uint8Array): Promise<Read> {
  const files = unzipChecked(bytes);
  const mammoth = await import("mammoth");
  const out = await mammoth.extractRawText({ buffer: Buffer.from(repack(files)) });
  return { text: out.value.replace(/\n{3,}/g, "\n\n").trim(), complete: true };
}

async function xlsxText(bytes: Uint8Array): Promise<Read> {
  const files = unzipChecked(bytes);
  // Cut each worksheet after the row cap before parsing, so a huge sheet is never fully parsed.
  const cut = new Set<string>();
  for (const name of Object.keys(files)) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) continue;
    const trimmed = trimRows(strFromU8(files[name]), MAX_ROWS_PER_SHEET);
    if (trimmed !== null) {
      files[name] = strToU8(trimmed);
      cut.add(name);
    }
  }
  const { default: readXlsxFile } = await import("read-excel-file/node");
  const sheets = await readXlsxFile(Buffer.from(repack(files)));
  const text = sheets
    .map(({ sheet, data }) => {
      const rows = data.slice(0, MAX_ROWS_PER_SHEET).map((row) => row.map(cell).join("\t"));
      const more = data.length > MAX_ROWS_PER_SHEET || (cut.size > 0 && data.length >= MAX_ROWS_PER_SHEET)
        ? `\n(only the first ${MAX_ROWS_PER_SHEET.toLocaleString("en")} rows are read)`
        : "";
      return `--- Sheet: ${sheet} ---\n${rows.join("\n")}${more}`;
    })
    .join("\n\n");
  return { text, complete: true };
}

/**
 * The worksheet XML ended just after its `max`-th row (rows past the cap are never parsed),
 * or null when it has no more rows than that.
 */
export function trimRows(xml: string, max: number): string | null {
  const close = /<\/((?:[\w.-]+:)?)row>/g;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = close.exec(xml))) {
    n += 1;
    if (n === max) {
      const rest = xml.slice(close.lastIndex);
      if (!/<(?:[\w.-]+:)?row[\s/>]/.test(rest)) return null;
      const p = m[1];
      return `${xml.slice(0, close.lastIndex)}</${p}sheetData></${p}worksheet>`;
    }
  }
  return null;
}

function cell(v: unknown) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/[\t\n]+/g, " ");
}

/** Slide text from a .pptx: each slide's text runs, in slide order. */
export function pptxText(bytes: Uint8Array) {
  return pptxRead(bytes, Infinity).text;
}

function pptxRead(bytes: Uint8Array, want: number): Read {
  const files = unzipChecked(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const num = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
  const parts: string[] = [];
  let chars = 0;
  const names = Object.keys(files).sort((a, b) => num(a) - num(b));
  for (const name of names) {
    const text = strFromU8(files[name])
      .split(/<\/a:p>/)
      .map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""))
      .filter((line) => line.trim())
      .join("\n");
    const part = `--- Slide ${num(name)} ---\n${text}`;
    parts.push(part);
    chars += part.length + 2;
    if (chars >= want && parts.length < names.length) return { text: parts.join("\n\n"), complete: false };
  }
  return { text: parts.join("\n\n"), complete: true };
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

// ---------------------------------------------------------------- PDF

class OutOfTime extends Error {}

/** Wait for `p`, but give up when the deadline passes. */
function before<T>(p: Promise<T>, deadline: number): Promise<T> {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.reject(new OutOfTime());
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OutOfTime()), left);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function pdfText(bytes: Uint8Array, want: number, budgetMs: number): Promise<Read> {
  const deadline = Date.now() + budgetMs;
  // The legacy build runs in Node. Loading the worker module up front lets pdf.js run it
  // in this process (no separate worker thread), and keeps it in the server bundle.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error -- the worker module ships without type declarations
  if (!g.pdfjsWorker) g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // (pdf.js 6 no longer has an eval-based font path, so there is no isEvalSupported to turn off.)
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), // pdf.js takes ownership of the buffer
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  // (A password-protected PDF rejects task.promise with a PasswordException → DAMAGED below.)
  const pages: string[] = [];
  let read = 0;
  try {
    let doc;
    try {
      doc = await before(task.promise, deadline);
    } catch (e) {
      if (e instanceof OutOfTime) throw new UnreadableFile("This PDF takes too long to open here. Open it in the app instead.");
      throw new UnreadableFile(DAMAGED);
    }
    const n = Math.min(doc.numPages, MAX_PDF_PAGES);
    let chars = 0;
    for (let i = 1; i <= n; i++) {
      let line = "";
      try {
        const page = await before(doc.getPage(i), deadline);
        const content = await before(page.getTextContent(), deadline);
        for (const item of content.items) {
          if (!("str" in item)) continue;
          line += item.str + (item.hasEOL ? "\n" : "");
        }
      } catch (e) {
        if (!(e instanceof OutOfTime)) throw e;
        const note = `Reading stopped after ${read} of ${doc.numPages} pages: this PDF takes too long to read here. The rest wasn't read — open it in the app.`;
        pages.push(`--- (${note}) ---`);
        return { text: pages.join("\n\n"), complete: false, note };
      }
      const part = `--- Page ${i} ---\n${line.trim()}`;
      pages.push(part);
      read = i;
      chars += part.length + 2;
      // Enough for this part (and to know more follows): later pages are read on the next call.
      if (chars >= want && i < doc.numPages) return { text: pages.join("\n\n"), complete: false };
    }
    if (doc.numPages > n) pages.push(`--- (${doc.numPages - n} more pages not read) ---`);
    return { text: pages.join("\n\n"), complete: true };
  } finally {
    await task.destroy().catch(() => {});
  }
}
