"use client";

import type { CSSProperties, ReactNode } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";

/**
 * Small celebrations, for real milestones only: a review step, a submission, a milestone done,
 * credits recognised. Never for routine saves, and never as a nag. The confetti is decoration:
 * it sits still when the system asks for reduced motion.
 */

const PIECES = [
  { className: "left-0 top-2 size-2.5 rounded-[3px] bg-[#ffc93c]", x: "-14px", y: "-12px", r: "40deg" },
  { className: "right-0 top-1 h-3.5 w-2 rounded-[3px] bg-sky", x: "14px", y: "-14px", r: "-35deg" },
  { className: "right-0 bottom-1 size-2.5 rounded-full bg-grape", x: "14px", y: "12px", r: "0deg" },
  { className: "left-1 bottom-0 h-2 w-3 rounded-[3px] bg-[#e0563b]", x: "-12px", y: "14px", r: "-25deg" },
  { className: "left-1/2 -top-1 size-2 rounded-full bg-leaf-bright", x: "0px", y: "-16px", r: "0deg" },
];

export function CelebrationBurst({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const lg = size === "lg";
  return (
    <span aria-hidden className={cn("relative inline-flex shrink-0 items-center justify-center", lg ? "size-36" : "size-14", className)}>
      <span className={cn("absolute rounded-full bg-leaf-soft", lg ? "inset-4" : "inset-0")} />
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300",
          lg ? "size-24 shadow-[0_6px_0_var(--primary-edge)] [&_svg]:size-12" : "size-9 shadow-[0_3px_0_var(--primary-edge)] [&_svg]:size-5",
        )}
      >
        <Check strokeWidth={3.2} />
      </span>
      {PIECES.map((p, i) => (
        <span
          key={i}
          className={cn("absolute motion-safe:animate-[celebrate-pop_600ms_ease-out_both]", p.className)}
          style={{ "--cx": p.x, "--cy": p.y, "--cr": p.r, animationDelay: `${i * 40}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/** Show a celebration toast: `celebrate("Screening finished", "Step 4 of 6 done")`. */
export function celebrate(title: ReactNode, detail?: ReactNode) {
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
