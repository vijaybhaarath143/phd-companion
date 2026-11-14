import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "cn";
import type { TaskPriority } from "@/lib/labels";

/** High ↑ / Low ↓ beside a task. Normal shows nothing, so ordinary tasks stay quiet. */
export function PriorityMark({ priority, className }: { priority: TaskPriority; className?: string }) {
  if (priority === "normal") return null;
  const high = priority === "high";
  const Icon = high ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-medium", high ? "text-zinc-900" : "text-zinc-500", className)}>
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
