"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
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
  return (
    <input
      type="checkbox"
      className={cn("size-5 shrink-0 accent-primary", className)}
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
  );
}
