/** Evidence files: what can be uploaded, and checking a file really is what it claims to be. */

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB (proposed limit, see plan §6.8)

const KINDS = {
  pdf: { exts: ["pdf"], label: "PDF" },
  image: { exts: ["png", "jpg", "jpeg", "webp", "gif", "heic", "heif"], label: "Image" },
  office: { exts: ["docx", "xlsx", "pptx"], label: "Word / Excel / PowerPoint" },
  text: { exts: ["csv", "txt"], label: "CSV or text" },
} as const;

export const ACCEPT = Object.values(KINDS).flatMap((k) => k.exts.map((e) => `.${e}`)).join(",");
export const ALLOWED_DESCRIPTION = "PDF, images, Word, Excel, PowerPoint, CSV or text — up to 20 MB";

export function extensionOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function isAllowedName(name: string) {
  const ext = extensionOf(name);
  return Object.values(KINDS).some((k) => (k.exts as readonly string[]).includes(ext));
}

/** Keep names readable but safe as a storage path segment. */
export function safeFileName(name: string) {
  const ext = extensionOf(name);
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "file";
  return ext ? `${base}.${ext}` : base;
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
};

const starts = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/**
 * Check the file's first bytes match its extension (a renamed .exe won't pass as a PDF).
 * Returns the content type to store, or null if the file isn't what its name says.
 */
export function sniff(bytes: Uint8Array, name: string): string | null {
  const ext = extensionOf(name);
  const ok = (() => {
    switch (ext) {
      case "pdf": return ascii(bytes, 0, 5) === "%PDF-";
      case "png": return starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case "jpg": case "jpeg": return starts(bytes, [0xff, 0xd8, 0xff]);
      case "gif": return ascii(bytes, 0, 4) === "GIF8";
      case "webp": return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
      case "heic": case "heif": return ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(bytes, 8, 12));
      case "docx": case "xlsx": case "pptx": return starts(bytes, [0x50, 0x4b, 0x03, 0x04]);
      case "csv": case "txt": {
        const head = bytes.slice(0, 4096);
        if (head.includes(0)) return false; // binary data
        try { new TextDecoder("utf-8", { fatal: true }).decode(head.length === 4096 ? head.slice(0, 4090) : head); return true; } catch { return false; }
      }
      default: return false;
    }
  })();
  return ok ? MIME_BY_EXT[ext] : null;
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
