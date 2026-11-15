"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "cn";
import { SprigMark } from "@/components/app/sprig-mark";
import { useReducedMotion, useSprigEyes } from "@/components/app/sprig-live";
import { MARK_HEIGHT, MARK_WIDTH, TILE_BOTTOM, TILE_TOP } from "@/components/app/sprig-mark-art.mjs";

const MARK_PX = { md: 40, sm: 36 } as const;
// The name lines up with the tile, not with the whole drawing (the leaves stick up above the tile).
// Centred in the row, a top margin of twice the gap between the two centres moves the name down by
// exactly that gap: as a share of the mark's width, that's 2 × (37.5 − 30) / 48.
const NAME_OFFSET = (2 * ((TILE_TOP + TILE_BOTTOM) / 2 - MARK_HEIGHT / 2)) / MARK_WIDTH;

/**
 * The logo with the app's name: Sprig's tile and a stacked "PhD / Companion". It blinks, sways its
 * leaves and watches the pointer; hovering wiggles the leaves and a click makes it hop. Under
 * reduced motion it stands still. Without `href` it's just the lockup (onboarding, where leaving
 * the step by accident would lose what she typed).
 */
export function Brand({ href, size = "md", className }: { href?: string; size?: "md" | "sm"; className?: string }) {
  // the eyes aim from the mark itself, on a wrapper that stays put while the hop remounts its insides
  const markRef = useRef<HTMLSpanElement>(null);
  const still = useReducedMotion();
  useSprigEyes(markRef, !still);
  const [hops, setHops] = useState(0);
  const hop = () => setHops((n) => n + 1);

  const content = (
    <>
      <span ref={markRef} className="block">
        <span key={hops} data-trick={hops > 0 ? "hop" : undefined} className="sprig-trick block">
          <SprigMark lively style={{ width: MARK_PX[size] }} />
        </span>
      </span>
      {/* the space keeps the name "PhD Companion" whole for screen readers and copy-paste */}
      <span className="flex flex-col" style={{ marginTop: NAME_OFFSET * MARK_PX[size] }}>
        <span className="font-display text-[11px] leading-none font-black tracking-[0.08em] text-primary">PhD</span>{" "}
        {/* size before line height: a text size after it would make the class merger drop leading-tight */}
        <span className={cn("font-display font-black", size === "sm" ? "text-[17px]" : "text-[19px]", "leading-tight")}>Companion</span>
      </span>
    </>
  );
  const look = cn("sprig-brand flex w-fit items-center gap-2.5", className);

  if (!href) {
    return (
      <div className={look} onClick={hop}>
        {content}
      </div>
    );
  }
  return (
    <Link href={href} onClick={hop} className={cn(look, "rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-sky-soft")}>
      {content}
    </Link>
  );
}
