"use client";

import { useState, useTransition } from "react";
import { cn } from "cn";
import { quickAction } from "@/components/app/call-action";
import type { ActionResult } from "@/lib/result";

/**
 * A tick box that saves at once. It shows the tick straight away; if the save fails it says
 * why and un-ticks, so the screen never shows a change that wasn't saved.
 */
export function QuickCheckbox({ checked, label, onToggle, disabled, className }: {
  checked: boolean;
  label: string;
  onToggle: (next: boolean) => Promise<ActionResult<unknown> | void>;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(checked);
  const [shown, setShown] = useState(checked);
  const [pending, start] = useTransition();
  // a fresh value from the server (after a refresh) wins
  if (checked !== shown) {
    setShown(checked);
    setValue(checked);
  }
  return (
    <input
      type="checkbox"
      className={cn("size-5 shrink-0 accent-primary", className)}
      aria-label={label}
      checked={value}
      disabled={disabled || pending}
      onChange={(e) => {
        const next = e.target.checked;
        setValue(next);
        start(async () => {
          await quickAction(() => onToggle(next), () => setValue(!next));
        });
      }}
    />
  );
}
