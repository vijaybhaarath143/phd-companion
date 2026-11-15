// Makes every app icon from the logo's drawing (src/components/app/sprig-mark-art.mjs), so the
// browser tab, the home screen and the installed app all show the same Sprig as the sidebar.
//
// Run after changing the logo:   npm run icons
//
// Uses sharp, which Next.js already installs for its image handling (no extra dependency).
//
//   src/app/favicon.ico            16, 32 and 48 px: the mark on its own (leaves and all)
//   src/app/icon.png               64 px, the same
//   src/app/apple-icon.png         180 px on a pale leaf-green square (iOS needs it filled in)
//   public/icon-192.png, -512.png  the installed app: the mark on its own
//   public/icon-maskable-512.png   Android crops this to its own shape: the mark sits inside the
//                                  safe circle (80% across) on the pale leaf-green square

import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { ICON_PALETTE, MARK_HEIGHT, MARK_WIDTH, markMarkup } from "../src/components/app/sprig-mark-art.mjs";

const BACKDROP = "#e4f6dc"; // --leaf-soft
const mark = markMarkup(ICON_PALETTE);

/** A square icon `size` px across with the mark `markHeight` px tall, centred, over an optional backdrop. */
function iconSvg(size, markHeight, backdrop) {
  const scale = markHeight / MARK_HEIGHT;
  const x = (size - MARK_WIDTH * scale) / 2;
  const y = (size - markHeight) / 2;
  const fill = backdrop ? `<rect width="${size}" height="${size}" fill="${backdrop}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${fill}<g transform="translate(${x} ${y}) scale(${scale})">${mark}</g></svg>`;
}

function png(size, markHeight, backdrop) {
  return sharp(Buffer.from(iconSvg(size, markHeight, backdrop))).png({ compressionLevel: 9 }).toBuffer();
}

/** A .ico holding PNG images (every browser since 2007 reads these). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e); // width (0 means 256)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
    header.writeUInt8(0, e + 2); // no palette
    header.writeUInt8(0, e + 3); // reserved
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const favicon = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(size, size) })));

const files = {
  "src/app/favicon.ico": ico(favicon),
  "src/app/icon.png": await png(64, 64),
  "src/app/apple-icon.png": await png(180, 130, BACKDROP),
  "public/icon-192.png": await png(192, 184),
  "public/icon-512.png": await png(512, 492),
  "public/icon-maskable-512.png": await png(512, 318, BACKDROP),
};

for (const [path, data] of Object.entries(files)) {
  await writeFile(new URL(`../${path}`, import.meta.url), data);
  console.log(`${path}  ${(data.length / 1024).toFixed(1)} KB`);
}
