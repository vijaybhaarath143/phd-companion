"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { Check } from "lucide-react";
import { toggleTask } from "@/server/actions/tasks";
import { quickAction } from "@/components/app/call-action";

/**
 * "Done" checkbox for a task. Ticks at once; if the save fails it says so and un-ticks
 * again, so the screen never shows a change that wasn't saved.
 */
export function TaskCheckbox({ id, title, done, className }: { id: string; title: string; done: boolean; className?: string }) {
  const [checked, setChecked] = useState(done);
  const [shown, setShown] = useState(done);
  const [pending, start] = useTransition();
  // a fresh value from the server (after a refresh) wins
  if (done !== shown) {
    setShown(done);
    setChecked(done);
  }
  // A round, chunky checkbox (the native input, restyled, so keyboard and screen readers work as usual).
  return (
    <span className={cn("relative inline-flex size-7 shrink-0", className)}>
      <input
        type="checkbox"
        className="peer size-7 cursor-pointer appearance-none rounded-full border-[3px] border-zinc-300 bg-card transition-colors outline-none checked:border-primary checked:bg-primary checked:shadow-[0_3px_0_var(--primary-edge)] hover:border-zinc-400 checked:hover:border-primary focus-visible:ring-4 focus-visible:ring-sky-soft disabled:cursor-wait disabled:opacity-60"
        aria-label={`Done: ${title}`}
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          start(async () => {
            await quickAction(() => toggleTask(id, next), () => setChecked(!next));
          });
        }}
      />
      <Check aria-hidden strokeWidth={3.4} className="pointer-events-none absolute inset-0 m-auto size-4 text-primary-foreground opacity-0 peer-checked:opacity-100" />
    </span>
  );
}
