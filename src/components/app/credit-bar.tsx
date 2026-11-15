import { cn } from "cn";
import { formatCredits, type CreditSummary } from "@/lib/credits";

/**
 * Coursework credits as one segmented bar: recognised · completed · enrolled · planned · still
 * needed. Credits that aren't recorded yet are never drawn (unknown is never zero); the legend
 * says how many courses are missing a value instead.
 */
export function CreditBar({ summary, className }: { summary: CreditSummary; className?: string }) {
  const recognised = summary.recognised;
  const completed = Math.max(summary.completed.known - recognised, 0);
  const enrolled = summary.enrolled.known;
  const planned = summary.planned.known;
  const filled = recognised + completed + enrolled + planned;
  const needed = summary.required !== null ? Math.max(summary.required - recognised - completed - enrolled, 0) : 0;
  const total = Math.max(summary.required ?? 0, filled, 1);
  const unknown = summary.completed.unknownCourses + summary.enrolled.unknownCourses + summary.planned.unknownCourses;

  const parts = [
    { key: "recognised", label: "Recognised", value: recognised, swatch: "bg-grape" },
    { key: "completed", label: "Completed", value: completed, swatch: "bg-grape-mid" },
    { key: "enrolled", label: "Enrolled", value: enrolled, swatch: "bg-grape-light" },
    { key: "planned", label: "Planned", value: planned, swatch: "bg-card ring-2 ring-inset ring-grape-light" },
  ];
  const spoken = [
    ...parts.map((p) => `${formatCredits(p.value)} ${p.label.toLowerCase()}`),
    summary.required !== null ? `${formatCredits(needed)} still needed of ${formatCredits(summary.required)}` : "no requirement set",
    unknown ? `${unknown} course${unknown > 1 ? "s" : ""} without a credit value` : null,
  ].filter(Boolean).join(", ");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div role="img" aria-label={`Credits: ${spoken}`} className="flex h-4 w-full gap-1 overflow-hidden rounded-full bg-zinc-100">
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} className={cn("h-full rounded-full", p.swatch)} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-600" aria-hidden>
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded-[4px]", p.swatch)} />
            {p.label} · <span className="font-medium text-foreground tabular-nums">{formatCredits(p.value)}</span>
          </li>
        ))}
        {summary.required !== null && (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[4px] bg-zinc-100 ring-2 ring-inset ring-zinc-200" />
            Still needed · <span className="font-medium text-foreground tabular-nums">{formatCredits(needed)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
