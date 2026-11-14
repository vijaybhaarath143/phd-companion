"use client";

import { cn } from "cn";

/** Segmented control built on native radio buttons: works in plain forms, keyboard and screen readers. */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  label,
  className,
  size = "default",
}: {
  name: string;
  value: T;
  onChange?: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1 rounded-[10px] bg-muted p-1", className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "relative flex flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-center text-[13px] font-medium whitespace-nowrap text-zinc-600 transition-colors",
            size === "sm" ? "h-8" : "h-9",
            "has-checked:bg-background has-checked:text-foreground has-checked:shadow-xs",
            "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange?.(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
