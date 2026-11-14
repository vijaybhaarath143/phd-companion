"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Ref } from "react";
import { cn } from "cn";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { SelectOption } from "@/lib/options";

export type { SelectOption };

/** Radix won't take "" as an item value, so "Any" / "Not set" options use this inside the menu. */
const EMPTY = "__empty__";
const toRadix = (v: string) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

const FINE_POINTER = "(pointer: fine)";
function subscribe(onChange: () => void) {
  const mq = window.matchMedia(FINE_POINTER);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * True on a mouse or trackpad. The server and the first paint say false, so the page
 * starts with the native select — it works before JavaScript loads, and phones keep
 * their own picker — and desktops switch to the styled menu once hydrated.
 */
function useFinePointer() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(FINE_POINTER).matches, () => false);
}

/**
 * A select that works in plain forms (`name`, `defaultValue`, form reset) and controlled
 * (`value` + `onValueChange`). Styled menu on desktop, the phone's own picker on touch.
 * A value that isn't among the options shows the first option, as a native select does.
 */
export function AppSelect({
  options,
  name,
  id,
  value,
  defaultValue,
  onValueChange,
  size = "default",
  className,
  disabled,
  required,
  "aria-label": ariaLabel,
}: {
  options: SelectOption[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: "sm" | "default";
  className?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
}) {
  const fine = useFinePointer();
  const resolve = (v: string | undefined) =>
    options.some((o) => o.value === v) ? (v as string) : (options[0]?.value ?? "");

  const [initial] = useState(() => resolve(defaultValue));
  const [inner, setInner] = useState(initial);
  const controlled = value !== undefined;
  const current = resolve(controlled ? value : inner);

  const change = (v: string) => {
    if (!controlled) setInner(v);
    onValueChange?.(v);
  };

  // A form reset puts an uncontrolled select back to where it started.
  const field = useRef<HTMLSelectElement | HTMLInputElement>(null);

  // A choice made in the native select before the page finished loading isn't seen by React;
  // pick it up once, before a desktop switches to the styled menu.
  const adopted = useRef(false);
  useLayoutEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    const el = field.current;
    if (!controlled && el instanceof HTMLSelectElement && el.value !== initial && options.some((o) => o.value === el.value)) setInner(el.value);
  }, [controlled, initial, options]);
  useEffect(() => {
    const form = field.current?.form;
    if (!form || controlled) return;
    const reset = () => {
      setInner(initial);
      // the browser's reset moves a native select to its first option; put it back
      queueMicrotask(() => {
        if (field.current instanceof HTMLSelectElement) field.current.value = initial;
      });
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, fine, initial]);

  if (!fine) {
    return (
      <NativeSelect
        ref={field as Ref<HTMLSelectElement>}
        id={id}
        name={name}
        value={current}
        onChange={(e) => change(e.target.value)}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        className={cn(size === "sm" && "h-9", className)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </NativeSelect>
    );
  }

  return (
    <>
      <Select value={toRadix(current)} onValueChange={(v) => change(fromRadix(v))} disabled={disabled} required={required}>
        <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={cn("w-full min-w-0", className)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-h-[min(20rem,var(--radix-select-content-available-height))]">
          {options.map((o) => <SelectItem key={o.value} value={toRadix(o.value)}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {/* Radix would submit its own item value; this submits the real one ("" included). */}
      {name && <input ref={field as Ref<HTMLInputElement>} type="hidden" name={name} value={current} disabled={disabled} />}
    </>
  );
}
