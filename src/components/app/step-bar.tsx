import { cn } from "cn";

/** A review's steps as equal segments: done (dark), the current one (mid grey), the rest (light). */
export function StepBar({ done, total, currentNo, className }: { done: number; total: number; currentNo: number | null; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${done} of ${total} steps done`}
      className={cn("grid h-1.5 gap-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("rounded-[2px]", i < done && i + 1 !== currentNo ? "bg-zinc-900" : i + 1 === currentNo ? "bg-zinc-500" : "bg-zinc-200")} />
      ))}
    </span>
  );
}
