import { cn } from "cn";

/** A review's steps as fat rounded segments: done (Leaf), the current one (light Leaf), the rest (grey). */
export function StepBar({ done, total, currentNo, className }: { done: number; total: number; currentNo: number | null; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${done} of ${total} steps done`}
      className={cn("grid h-3 gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${Math.max(total, 1)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("rounded-full", i < done && i + 1 !== currentNo ? "bg-primary" : i + 1 === currentNo ? "bg-leaf-bright/60" : "bg-zinc-200")} />
      ))}
    </span>
  );
}
