import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "cn";
import { taskPriorities } from "@/lib/labels";
import type { TaskPriority } from "@/lib/labels";

/** High ↑ / Low ↓ beside a task. Normal shows nothing, so ordinary tasks stay quiet. */
export function PriorityMark({ priority, className }: { priority: TaskPriority; className?: string }) {
  if (priority === "normal") return null;
  const high = priority === "high";
  const Icon = high ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-display text-[12px] font-extrabold", high ? "text-overdue-foreground" : "text-zinc-500", className)}>
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {high ? "High" : "Low"}
    </span>
  );
}

/** The priority choices with their arrows, for Segmented controls. */
export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

/** Priority as a dot before a task: High red, Normal grey, Low hollow (spoken as words). */
export function PriorityDot({ priority, className }: { priority: TaskPriority; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)} title={`${taskPriorities[priority]} priority`}>
      <span
        aria-hidden
        className={cn(
          "size-2.5 rounded-full",
          priority === "high" ? "bg-overdue-foreground" : priority === "normal" ? "bg-zinc-400" : "border-2 border-zinc-400",
        )}
      />
      <span className="sr-only">{taskPriorities[priority]} priority</span>
    </span>
  );
}
