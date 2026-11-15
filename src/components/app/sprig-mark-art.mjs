// @ts-check
/**
 * The app's logo: Sprig as a tile. Its body is the app's rounded square, with a face, and two leaves
 * grow out of the top edge, so the outline is the app's own. One drawing for both the logo in the
 * app (sprig-mark.tsx) and the app icons (scripts/make-icons.mjs), so they can't drift apart.
 *
 * Plain JavaScript on purpose: the icon script runs in Node without a build step.
 *
 * Each part is [element, attributes]. A `fill` or `stroke` that names a colour role ("body", "edge",
 * …) is resolved by whoever draws it: CSS variables in the app, fixed colours in the icons.
 */

/** @typedef {"body" | "edge" | "leafDark" | "ink" | "white" | "cheek"} ColourRole */
/** @typedef {Record<ColourRole, string>} Palette */
/** @typedef {["rect" | "ellipse" | "circle" | "path", Record<string, string | number>]} Part */

export const MARK_WIDTH = 48;
export const MARK_HEIGHT = 60;
/** Where the tile itself sits (its top edge to the bottom of its darker edge); the leaves are above. */
export const TILE_TOP = 16;
export const TILE_BOTTOM = 59;

/** @type {Record<"tile" | "leaves" | "whites" | "pupils" | "face", Part[]>} */
export const MARK_PARTS = {
  tile: [
    ["rect", { x: 2, y: 19, width: 44, height: 40, rx: 13, fill: "edge" }],
    ["rect", { x: 2, y: 16, width: 44, height: 40, rx: 13, fill: "body" }],
    ["ellipse", { cx: 12, cy: 24, rx: 5, ry: 2.6, transform: "rotate(-25 12 24)", fill: "white", opacity: 0.35 }],
  ],
  leaves: [
    ["path", { d: "M24 17V9", stroke: "edge", "stroke-width": 2.8, "stroke-linecap": "round", fill: "none" }],
    ["ellipse", { cx: 17, cy: 8, rx: 7, ry: 3.8, transform: "rotate(-28 17 8)", fill: "leafDark" }],
    ["ellipse", { cx: 31, cy: 6, rx: 8, ry: 4.2, transform: "rotate(24 31 6)", fill: "edge" }],
  ],
  whites: [
    ["ellipse", { cx: 17, cy: 33, rx: 5, ry: 5.8, fill: "white" }],
    ["ellipse", { cx: 31, cy: 33, rx: 5, ry: 5.8, fill: "white" }],
  ],
  pupils: [
    ["circle", { cx: 17.8, cy: 34.2, r: 3, fill: "ink" }],
    ["circle", { cx: 31.8, cy: 34.2, r: 3, fill: "ink" }],
    ["circle", { cx: 18.9, cy: 32.9, r: 1, fill: "white" }],
    ["circle", { cx: 32.9, cy: 32.9, r: 1, fill: "white" }],
  ],
  face: [
    ["ellipse", { cx: 10.5, cy: 41, rx: 3.2, ry: 2.3, fill: "cheek" }],
    ["ellipse", { cx: 37.5, cy: 41, rx: 3.2, ry: 2.3, fill: "cheek" }],
    ["path", { d: "M20 41Q24 45 28 41", stroke: "leafDark", "stroke-width": 2.2, "stroke-linecap": "round", fill: "none" }],
  ],
};

/** The app's colours as fixed values, for the icons (the app itself uses its CSS variables). */
/** @type {Palette} */
export const ICON_PALETTE = { body: "#5cc73f", edge: "#268519", leafDark: "#1b6411", ink: "#2d2d33", white: "#ffffff", cheek: "#f5a08c" };

/**
 * Resolve a part's colour roles against a palette; anything else passes through unchanged.
 * @param {Record<string, string | number>} attrs
 * @param {Palette} palette
 */
export function paint(attrs, palette) {
  /** @type {Record<string, string | number>} */
  const out = { ...attrs };
  for (const key of ["fill", "stroke"]) {
    const v = out[key];
    if (typeof v === "string" && v in palette) out[key] = palette[/** @type {ColourRole} */ (v)];
  }
  return out;
}

/**
 * The mark's parts as SVG markup (no outer <svg>), for the icon script.
 * @param {Palette} palette
 */
export function markMarkup(palette) {
  const parts = [...MARK_PARTS.tile, ...MARK_PARTS.leaves, ...MARK_PARTS.whites, ...MARK_PARTS.pupils, ...MARK_PARTS.face];
  return parts
    .map(([tag, attrs]) => {
      const a = Object.entries(paint(attrs, palette))
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
}
