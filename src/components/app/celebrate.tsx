"use client";

import type { CSSProperties } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { LiveSprig } from "@/components/app/sprig-live";
import { cueSprig, sprigIsHere } from "@/components/app/sprig-bus";

/**
 * Small celebrations, for real milestones only: a review step, a submission, a milestone done,
 * credits recognised. Never for routine saves, and never as a nag. The confetti is decoration:
 * it sits still when the system asks for reduced motion.
 */

const PIECES = [
  { className: "left-0 top-2 size-2.5 rounded-[3px] bg-sun-bright", x: "-14px", y: "-12px", r: "40deg" },
  { className: "right-0 top-1 h-3.5 w-2 rounded-[3px] bg-sky", x: "14px", y: "-14px", r: "-35deg" },
  { className: "right-0 bottom-1 size-2.5 rounded-full bg-grape", x: "14px", y: "12px", r: "0deg" },
  { className: "left-1 bottom-0 h-2 w-3 rounded-[3px] bg-berry-bright", x: "-12px", y: "14px", r: "-25deg" },
  { className: "left-1/2 -top-1 size-2 rounded-full bg-leaf-bright", x: "0px", y: "-16px", r: "0deg" },
];

/** Proud Sprig on a soft circle (tap it to play), with confetti flying out around it. */
export function CelebrationBurst({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const lg = size === "lg";
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", lg ? "size-36" : "size-14", className)}>
      <span aria-hidden className={cn("absolute rounded-full bg-leaf-soft", lg ? "inset-4" : "inset-0")} />
      <LiveSprig mood="proud" className={cn("relative", lg ? "w-28" : "w-10")} />
      {PIECES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("absolute motion-safe:animate-[celebrate-pop_600ms_ease-out_both]", p.className)}
          style={{ "--cx": p.x, "--cy": p.y, "--cr": p.r, animationDelay: `${i * 40}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * Celebrate: `celebrate("Screening finished", "Step 4 of 6 done")`. Sprig in the corner cheers with
 * confetti and says it; where she can't see Sprig (no Sprig on the page, or a dialog covering it),
 * a celebration toast says it instead.
 */
export function celebrate(title: string, detail?: string) {
  if (sprigIsHere()) {
    cueSprig({ kind: "celebrate", title, detail });
    return;
  }
  toast.custom(() => (
    <div className="flex w-[min(360px,calc(100vw-32px))] items-center gap-3 rounded-2xl border-2 border-leaf-soft bg-card p-3 pr-4 shadow-[0_4px_0_var(--leaf-soft)]">
      <CelebrationBurst />
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-[15px] font-black text-foreground">{title}</span>
        {detail && <span className="text-[13px] text-muted-foreground">{detail}</span>}
      </div>
    </div>
  ));
}
