import { describe, expect, it } from "vitest";
import { isAllowedName, safeFileName, sniff, formatBytes } from "@/lib/files";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("evidence file checks", () => {
  it("accepts the supported document and image types by name", () => {
    for (const n of ["certificate.pdf", "poster.PNG", "photo.jpeg", "data.xlsx", "notes.txt", "results.csv", "scan.heic"]) {
      expect(isAllowedName(n), n).toBe(true);
    }
    for (const n of ["setup.exe", "script.js", "archive.zip", "noextension"]) expect(isAllowedName(n), n).toBe(false);
  });

  it("checks the real content, not just the name", () => {
    expect(sniff(bytes("%PDF-1.7\n"), "certificate.pdf")).toBe("application/pdf");
    expect(sniff(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "poster.png")).toBe("image/png");
    expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]), "photo.jpg")).toBe("image/jpeg");
    expect(sniff(bytes([0x50, 0x4b, 0x03, 0x04]), "data.xlsx")).toContain("spreadsheetml");
    expect(sniff(bytes("time,value\n1,2\n"), "results.csv")).toBe("text/csv");
  });

  it("refuses a file whose content doesn't match its name", () => {
    expect(sniff(bytes("MZ", [0x90, 0x00]), "certificate.pdf")).toBeNull(); // a Windows program renamed to .pdf
    expect(sniff(bytes("%PDF-1.7"), "photo.jpg")).toBeNull();
    expect(sniff(bytes("text", [0, 0, 0]), "notes.txt")).toBeNull(); // binary pretending to be text
    // a multi-byte character across the old 4 KB cut-off is still text
    expect(sniff(new TextEncoder().encode("शोध ".repeat(1500)), "notes.txt")).toBe("text/plain");
    // Excel on Windows saves CSVs in Windows-1252: 0xB0 = "°", 0xB5 = "µ"
    expect(sniff(new Uint8Array([...new TextEncoder().encode("temp,vol\n37"), 0xb0, 0x43, 0x2c, 0x35, 0xb5, 0x4c, 0x0a]), "lab.csv")).toBe("text/csv");
  });

  it("makes safe, readable storage names", () => {
    expect(safeFileName("SRM poster (final) v2.pdf")).toBe("SRM-poster-final-v2.pdf");
    expect(safeFileName("../../etc/passwd.txt")).toBe("etcpasswd.txt");
    expect(safeFileName("??.pdf")).toBe("file.pdf");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
