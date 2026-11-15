import { createElement, type CSSProperties } from "react";
import { cn } from "cn";
import { MARK_HEIGHT, MARK_PARTS, MARK_WIDTH, paint } from "@/components/app/sprig-mark-art.mjs";

/**
 * The app's logo: Sprig as a tile (see sprig-mark-art.mjs for the drawing, shared with the app
 * icons). In the app it's painted with the theme's colours. Decoration: whatever it sits next to
 * names the app. `lively` lets it blink, sway its leaves and look around, like Sprig does.
 */

const APP_PALETTE = {
  body: "var(--leaf-bright)",
  edge: "var(--primary)",
  leafDark: "var(--leaf-strong)",
  ink: "#2d2d33",
  white: "#ffffff",
  cheek: "#f5a08c",
};

/** SVG attribute names as React wants them (stroke-width → strokeWidth). */
function reactProps(attrs: Record<string, string | number>) {
  return Object.fromEntries(Object.entries(paint(attrs, APP_PALETTE)).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
}

function Parts({ parts }: { parts: (typeof MARK_PARTS)[keyof typeof MARK_PARTS] }) {
  return parts.map(([tag, attrs], i) => createElement(tag, { key: i, ...reactProps(attrs) }));
}

export function SprigMark({ lively = false, className, style }: { lively?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`}
      aria-hidden
      focusable="false"
      className={cn("h-auto w-10 shrink-0 overflow-visible", lively && "sprig-lively", className)}
      style={style}
    >
      <Parts parts={MARK_PARTS.tile} />
      <g className="sprig-sway sprig-mark-leaves">
        <Parts parts={MARK_PARTS.leaves} />
      </g>
      <g className="sprig-blink">
        <Parts parts={MARK_PARTS.whites} />
        <g className="sprig-look">
          <Parts parts={MARK_PARTS.pupils} />
        </g>
      </g>
      <Parts parts={MARK_PARTS.face} />
    </svg>
  );
}
