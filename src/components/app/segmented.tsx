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
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1 rounded-2xl bg-muted p-1", className)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "relative flex flex-1 cursor-pointer items-center justify-center rounded-xl px-3 text-center font-display text-[13px] font-extrabold whitespace-nowrap text-zinc-600 transition-colors",
            size === "sm" ? "h-9" : "h-10",
            "has-checked:bg-card has-checked:text-foreground has-checked:shadow-[0_2px_0_var(--border)]",
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
