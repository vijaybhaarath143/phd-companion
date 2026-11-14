// Tiny, hand-built documents for testing text extraction (no binary files in the repo).
import { strToU8, zipSync } from "fflate";

/** A one-page PDF whose page shows `text` (plain ASCII). */
export function makePdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(out);
}

const CT = (overrides: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`;
const rels = (items: [string, string, string][]) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join("") +
  `</Relationships>`;
const OD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function makeDocx(paragraphs: string[]): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(CT(`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`)),
    "_rels/.rels": strToU8(rels([["rId1", `${OD}/officeDocument`, "word/document.xml"]])),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("") +
        `</w:body></w:document>`,
    ),
  });
}

export function makeXlsx(rows: (string | number)[][]): Uint8Array {
  const col = (i: number) => String.fromCharCode(65 + i);
  const sheet =
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
    rows
      .map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => typeof v === "number"
        ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>`
        : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${v}</t></is></c>`).join("") + `</row>`)
      .join("") +
    `</sheetData></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(CT(
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)),
    "_rels/.rels": strToU8(rels([["rId1", `${OD}/officeDocument`, "xl/workbook.xml"]])),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${OD}">` +
        `<sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(rels([["rId1", `${OD}/worksheet`, "worksheets/sheet1.xml"]])),
    "xl/worksheets/sheet1.xml": strToU8(sheet),
  });
}

export function makePptx(slides: string[][]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CT("")),
  };
  slides.forEach((paras, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>` +
        paras.map((t) => `<a:p><a:r><a:rPr lang="en-GB"/><a:t>${t}</a:t></a:r></a:p>`).join("") +
        `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  });
  return zipSync(files);
}
