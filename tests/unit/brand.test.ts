import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SprigMark } from "@/components/app/sprig-mark";
import { ICON_PALETTE, MARK_PARTS, markMarkup } from "@/components/app/sprig-mark-art.mjs";
import manifest from "@/app/manifest";

/** Width and height from a PNG's header. */
function pngSize(path: string) {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("the logo", () => {
  it("draws with the theme's colours, hidden from screen readers", () => {
    const svg = renderToStaticMarkup(createElement(SprigMark));
    expect(svg).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(svg).toContain("var(--leaf-bright)");
    expect(svg).not.toMatch(/NaN|undefined/);
    // React attribute names, not SVG ones (a kebab-case name would be dropped or warned about)
    expect(svg).toContain('stroke-width="2.8"');
  });

  it("only moves when asked to be lively", () => {
    expect(renderToStaticMarkup(createElement(SprigMark))).not.toContain("sprig-lively");
    expect(renderToStaticMarkup(createElement(SprigMark, { lively: true }))).toContain("sprig-lively");
  });

  it("gives every colour role a real colour in the icons", () => {
    const roles = Object.keys(ICON_PALETTE);
    const markup = markMarkup(ICON_PALETTE);
    for (const role of roles) expect(markup).not.toMatch(new RegExp(`(fill|stroke)="${role}"`));
    // and every part's colour is either a role or a literal the icons can draw
    for (const [, attrs] of Object.values(MARK_PARTS).flat()) {
      for (const key of ["fill", "stroke"] as const) {
        const v = attrs[key];
        if (typeof v === "string") expect(roles.includes(v) || v === "none" || v.startsWith("#")).toBe(true);
      }
    }
  });
});

describe("the app icons", () => {
  it("are the sizes their names promise", () => {
    expect(pngSize("src/app/icon.png")).toEqual([64, 64]);
    expect(pngSize("src/app/apple-icon.png")).toEqual([180, 180]);
    expect(pngSize("public/icon-192.png")).toEqual([192, 192]);
    expect(pngSize("public/icon-512.png")).toEqual([512, 512]);
    expect(pngSize("public/icon-maskable-512.png")).toEqual([512, 512]);
  });

  it("include a favicon with 16, 32 and 48 px images", () => {
    const ico = readFileSync("src/app/favicon.ico");
    expect(ico.readUInt16LE(2)).toBe(1); // an icon file
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + 16 * i));
    expect(sizes).toEqual([16, 32, 48]);
  });

  it("are all there for the install manifest", () => {
    for (const icon of manifest().icons ?? []) {
      const [w, h] = pngSize(`public${icon.src}`);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });
});
