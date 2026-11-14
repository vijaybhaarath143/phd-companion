"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { extensionOf, formatBytes } from "@/lib/files";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PreviewFile = { id: string; name: string; filename: string | null; sizeBytes: number | null };

/**
 * Shows an evidence file inside the app. The file is read straight from her private
 * storage into this browser tab and turned into something viewable here — it is never
 * sent to an outside viewer (Google, Microsoft…), which matters for unpublished work.
 */
export function FilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  return (
    <Dialog open={file !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton
        className="flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[min(1040px,calc(100vw-1rem))] flex-col gap-0 overflow-hidden p-0 sm:h-[calc(100dvh-4rem)] sm:max-w-[min(1040px,calc(100vw-4rem))]"
      >
        {file && <PreviewBody key={file.id} file={file} />}
      </DialogContent>
    </Dialog>
  );
}

type Kind = "pdf" | "image" | "docx" | "xlsx" | "pptx" | "csv" | "txt" | "other";
function kindOf(name: string): Kind {
  const ext = extensionOf(name);
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"].includes(ext)) return "image";
  if (ext === "docx" || ext === "xlsx" || ext === "pptx" || ext === "csv" || ext === "txt") return ext;
  return "other";
}
const KIND_LABEL: Record<Kind, string> = {
  pdf: "PDF", image: "Image", docx: "Word document", xlsx: "Excel spreadsheet", pptx: "PowerPoint", csv: "CSV", txt: "Text", other: "File",
};

function PreviewBody({ file }: { file: PreviewFile }) {
  const name = file.filename ?? file.name;
  const kind = kindOf(name);
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await fetch(`/api/files/${file.id}?preview=1`);
      if (!meta.ok) throw new Error("open");
      const { url } = (await meta.json()) as { url: string };
      const res = await fetch(url);
      if (!res.ok) throw new Error("open");
      const buf = await res.arrayBuffer();
      if (!cancelled) setData(buf);
    })().catch(() => !cancelled && setError("This file couldn't be opened. Check your connection, or download it instead."));
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 pr-14 sm:px-5 sm:pr-14">
        <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-[1_1_200px]">
          <DialogTitle className="truncate text-[15px] font-semibold">{file.name}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {[KIND_LABEL[kind], formatBytes(file.sizeBytes)].filter(Boolean).join(" · ")}
          </DialogDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/files/${file.id}`} download>
            <Download className="size-4" aria-hidden /> Download
          </a>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-50">
        {error ? (
          <Message>{error}</Message>
        ) : !data ? (
          <Loading />
        ) : (
          <Viewer kind={kind} data={data} name={name} />
        )}
      </div>
    </>
  );
}

function Viewer({ kind, data, name }: { kind: Kind; data: ArrayBuffer; name: string }) {
  switch (kind) {
    case "pdf": return <PdfView data={data} />;
    case "image": return <ImageView data={data} name={name} />;
    case "docx": return <DocxView data={data} />;
    case "xlsx": return <XlsxView data={data} />;
    case "pptx": return <PptxView data={data} />;
    case "csv": return <TableView rows={parseCsv(decodeText(data))} />;
    case "txt": return <TextView text={decodeText(data)} />;
    default: return <Message>This kind of file can&apos;t be previewed. Download it to open it.</Message>;
  }
}

/* ── Shared bits ──────────────────────────────────────────────────────────── */

function Loading({ label = "Opening the file…" }: { label?: string }) {
  return (
    <p role="status" className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </p>
  );
}
function Message({ children }: { children: ReactNode }) {
  return <p className="mx-auto flex h-full min-h-40 max-w-md items-center justify-center px-6 text-center text-sm text-muted-foreground">{children}</p>;
}
function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto my-4 w-[calc(100%-2rem)] max-w-[860px] rounded-lg border bg-white shadow-xs", className)}>{children}</div>;
}
/** A temporary in-memory address for the file's bytes, released when the preview closes. */
function useBlobUrl(data: ArrayBuffer, type: string) {
  const url = useMemo(() => URL.createObjectURL(new Blob([data], { type })), [data, type]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}
const decodeText = (data: ArrayBuffer) => new TextDecoder("utf-8").decode(data);

/* ── PDF: every page drawn in the browser (works on phones too) ───────────── */

const PAGE_BATCH = 10;

function PdfView({ data }: { data: ArrayBuffer }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [shown, setShown] = useState(PAGE_BATCH);

  useEffect(() => {
    let destroyed = false;
    let task: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
      const d = await task.promise;
      if (!destroyed) setDoc(d);
    })().catch(() => !destroyed && setError(true));
    return () => {
      destroyed = true;
      void task?.destroy();
    };
  }, [data]);

  if (error) return <Message>This PDF couldn&apos;t be shown here. Download it to open it.</Message>;
  if (!doc) return <Loading label="Preparing pages…" />;
  const count = Math.min(shown, doc.numPages);
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      {Array.from({ length: count }, (_, i) => <PdfPage key={i} doc={doc} n={i + 1} />)}
      {doc.numPages > count ? (
        <Button variant="outline" onClick={() => setShown((s) => s + PAGE_BATCH)}>
          Show more pages <span className="font-normal text-muted-foreground">· {count} of {doc.numPages}</span>
        </Button>
      ) : (
        <p className="text-[12px] text-muted-foreground">{doc.numPages === 1 ? "1 page" : `${doc.numPages} pages`}</p>
      )}
    </div>
  );
}

function PdfPage({ doc, n }: { doc: PDFDocumentProxy; n: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414); // A4 until the page is measured

  useEffect(() => {
    let cancelled = false;
    let render: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      if (cancelled || !wrap.current || !canvas.current) return;
      setRatio(base.height / base.width);
      const width = wrap.current.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      render = page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport });
      await render.promise;
    })().catch(() => {});
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [doc, n]);

  return (
    <div ref={wrap} className="w-[calc(100%-2rem)] max-w-[860px] overflow-hidden rounded-sm bg-white shadow-sm ring-1 ring-zinc-200" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${n}`} role="img" />
    </div>
  );
}

/* ── Images ───────────────────────────────────────────────────────────────── */

function ImageView({ data, name }: { data: ArrayBuffer; name: string }) {
  const ext = extensionOf(name);
  const type = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const url = useBlobUrl(data, type);
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <Message>
        {ext === "heic" || ext === "heif"
          ? "This browser can't show iPhone HEIC photos. Download it to view, or open the app in Safari."
          : "This image couldn't be shown. Download it to open it."}
      </Message>
    );
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- a private file shown from memory, not a site image */}
      <img src={url} alt={name} onError={() => setFailed(true)} className="max-h-[calc(100dvh-10rem)] max-w-full rounded-sm bg-white object-contain shadow-sm" />
    </div>
  );
}

/* ── Word (.docx): converted to simple formatted text ─────────────────────── */

function DocxView({ data }: { data: ArrayBuffer }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mammoth = await import("mammoth");
      const out = await mammoth.convertToHtml({ arrayBuffer: data });
      if (!cancelled) setHtml(sanitizeHtml(out.value));
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [data]);
  if (error) return <Message>This document couldn&apos;t be shown here. Download it to open it in Word.</Message>;
  if (html === null) return <Loading label="Preparing the document…" />;
  return (
    <Sheet className="px-6 py-8 sm:px-12 sm:py-10">
      {html ? (
        <div
          className="text-[15px] leading-relaxed text-zinc-900 [&_a]:text-blue-700 [&_a]:underline [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_img]:my-3 [&_img]:max-w-full [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <p className="text-muted-foreground">This document has no text to show.</p>
      )}
      <p className="mt-8 border-t pt-3 text-[12px] text-muted-foreground">A simplified preview — layout, fonts and some formatting may differ from Word.</p>
    </Sheet>
  );
}

/** Keep only plain document formatting from the converted Word file: no scripts, styles or odd links. */
const ALLOWED_TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "U", "S", "SUP", "SUB", "BR", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "A", "IMG", "BLOCKQUOTE"]);
function sanitizeHtml(input: string) {
  const doc = new DOMParser().parseFromString(`<div>${input}</div>`, "text/html");
  const clean = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes); // keep the text, drop the tag
        continue;
      }
      for (const attr of [...child.attributes]) {
        const keep =
          (child.tagName === "A" && attr.name === "href" && /^(https?:|mailto:|#)/i.test(attr.value)) ||
          (child.tagName === "IMG" && attr.name === "src" && /^data:image\/(png|jpe?g|gif|webp);/i.test(attr.value)) ||
          (child.tagName === "IMG" && attr.name === "alt") ||
          ((child.tagName === "TD" || child.tagName === "TH") && (attr.name === "colspan" || attr.name === "rowspan"));
        if (!keep) child.removeAttribute(attr.name);
      }
      if (child.tagName === "A") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noreferrer noopener");
      }
    }
    for (const child of [...node.children]) clean(child);
  };
  const root = doc.body.firstElementChild!;
  // sanitising may unwrap tags and expose new children, so repeat until stable
  for (let i = 0; i < 5; i++) clean(root);
  return root.innerHTML;
}

/* ── Excel (.xlsx): each sheet as a table ─────────────────────────────────── */

type Cell = string | number | boolean | Date | null;

function XlsxView({ data }: { data: ArrayBuffer }) {
  const [sheets, setSheets] = useState<{ sheet: string; data: Cell[][] }[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const out = await readXlsxFile(data);
      if (!cancelled) setSheets(out as { sheet: string; data: Cell[][] }[]);
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [data]);
  if (error) return <Message>This spreadsheet couldn&apos;t be shown here. Download it to open it in Excel.</Message>;
  if (!sheets) return <Loading label="Reading the spreadsheet…" />;
  const sheet = sheets[active];
  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white px-3 pt-2">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn("shrink-0 rounded-t-md border border-b-0 px-3 py-1.5 text-[13px]", i === active ? "bg-zinc-50 font-medium" : "border-transparent text-zinc-600 hover:bg-zinc-50")}
            >
              {s.sheet}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <TableView rows={sheet?.data ?? []} />
      </div>
    </div>
  );
}

/* ── CSV / text / tables ──────────────────────────────────────────────────── */

const MAX_ROWS = 1000;
const MAX_COLS = 60;

function cellText(v: Cell) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

function TableView({ rows }: { rows: Cell[][] }) {
  if (!rows.length || rows.every((r) => r.every((c) => cellText(c) === ""))) return <Message>This sheet is empty.</Message>;
  const shown = rows.slice(0, MAX_ROWS);
  const cols = Math.min(MAX_COLS, Math.max(...shown.map((r) => r.length)));
  return (
    <div className="p-3 sm:p-4">
      <div className="w-fit max-w-none overflow-hidden rounded-lg border bg-white">
        <table className="border-collapse text-[13px]">
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={i === 0 ? "bg-zinc-100 font-medium" : "even:bg-zinc-50/60"}>
                <td className="sticky left-0 border-r border-b bg-zinc-100 px-2 py-1 text-right text-[11px] text-muted-foreground tabular-nums">{i + 1}</td>
                {Array.from({ length: cols }, (_, j) => {
                  const v = r[j] ?? null;
                  return (
                    <td key={j} className={cn("max-w-72 truncate border-r border-b px-2.5 py-1", typeof v === "number" && "text-right tabular-nums")} title={cellText(v)}>
                      {cellText(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(rows.length > MAX_ROWS || rows.some((r) => r.length > MAX_COLS)) && (
        <p className="mt-2 text-[12px] text-muted-foreground">Showing the first {Math.min(rows.length, MAX_ROWS)} rows and {cols} columns. Download the file to see everything.</p>
      )}
    </div>
  );
}

/** Reads CSV, including quoted values with commas or line breaks inside. */
function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  const delim = (src.split("\n", 1)[0].match(/;/g)?.length ?? 0) > (src.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
      if (rows.length > MAX_ROWS) break;
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function TextView({ text }: { text: string }) {
  const limit = 300_000;
  return (
    <Sheet className="px-5 py-4">
      <pre className="font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-zinc-900">{text.slice(0, limit) || "This file is empty."}</pre>
      {text.length > limit && <p className="mt-3 text-[12px] text-muted-foreground">Showing the beginning of the file. Download it to see everything.</p>}
    </Sheet>
  );
}

/* ── PowerPoint (.pptx): each slide's text and pictures ───────────────────── */

type Slide = { n: number; text: string[]; images: string[] };

function PptxView({ data }: { data: ArrayBuffer }) {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      const { unzipSync, strFromU8 } = await import("fflate");
      const files = unzipSync(new Uint8Array(data), {
        filter: (f) => /^ppt\/(slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|media\/)/.test(f.name),
      });
      const parser = new DOMParser();
      const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
      const out: Slide[] = Object.keys(files)
        .map((name) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(name))
        .filter((m): m is RegExpExecArray => Boolean(m))
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b)
        .map((n) => {
          const xml = parser.parseFromString(strFromU8(files[`ppt/slides/slide${n}.xml`]), "application/xml");
          const text = [...xml.getElementsByTagNameNS(A, "p")]
            .map((p) => [...p.getElementsByTagNameNS(A, "t")].map((t) => t.textContent ?? "").join(""))
            .filter((t) => t.trim());
          const rels = files[`ppt/slides/_rels/slide${n}.xml.rels`];
          const images: string[] = [];
          if (rels) {
            const doc = parser.parseFromString(strFromU8(rels), "application/xml");
            for (const r of doc.getElementsByTagName("Relationship")) {
              if (!r.getAttribute("Type")?.endsWith("/image")) continue;
              const target = (r.getAttribute("Target") ?? "").replace(/^\.\.\//, "ppt/");
              const ext = extensionOf(target);
              const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[ext];
              const bytes = files[target];
              if (!type || !bytes) continue; // e.g. old Windows drawing formats
              const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
              urls.push(u);
              images.push(u);
            }
          }
          return { n, text, images };
        });
      if (!cancelled) setSlides(out);
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [data]);

  if (error) return <Message>This presentation couldn&apos;t be shown here. Download it to open it in PowerPoint.</Message>;
  if (!slides) return <Loading label="Reading the slides…" />;
  if (!slides.length) return <Message>No slides found. Download the file to open it in PowerPoint.</Message>;
  return (
    <div className="flex flex-col gap-3 py-4">
      <p className="mx-auto w-[calc(100%-2rem)] max-w-[860px] text-[12px] text-muted-foreground">
        The words and pictures from each slide — not the slide design. Download the file to see it exactly as it looks.
      </p>
      {slides.map((s) => (
        <Sheet key={s.n} className="my-0 px-5 py-4">
          <p className="mb-2 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">Slide {s.n}</p>
          {s.text.length ? (
            <div className="flex flex-col gap-1">
              {s.text.map((t, i) => <p key={i} className={i === 0 ? "text-[16px] font-semibold" : "text-[14px] text-zinc-800"}>{t}</p>)}
            </div>
          ) : (
            !s.images.length && <p className="text-[13px] text-muted-foreground">No text on this slide.</p>
          )}
          {s.images.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- pictures from her own file, shown from memory */}
              {s.images.map((u, i) => <img key={i} src={u} alt={`Picture ${i + 1} on slide ${s.n}`} className="max-h-56 max-w-full rounded border object-contain" />)}
            </div>
          )}
        </Sheet>
      ))}
    </div>
  );
}
