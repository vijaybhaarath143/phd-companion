"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/result";

export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

/**
 * Debounced autosave. Changes are merged and sent ~1.2s after typing stops (or
 * immediately for choices). The server rejects stale versions, so another tab's
 * newer changes are never overwritten — we show a conflict instead.
 */
export function useAutosave<P extends Record<string, unknown>>(
  initialVersion: number,
  save: (version: number, patch: P) => Promise<ActionResult<{ version: number }>>,
  merge: (a: P, b: P) => P,
) {
  const version = useRef(initialVersion);
  const pending = useRef<P | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) return;
    // Send queued changes one batch at a time until nothing is left.
    while (pending.current) {
      const patch: P = pending.current;
      pending.current = null;
      inFlight.current = true;
      setState("saving");
      const r = await save(version.current, patch);
      inFlight.current = false;
      if (!r.ok) {
        // keep the unsent change so Retry can resend it
        pending.current = pending.current ? merge(patch, pending.current) : patch;
        setState(r.error.kind === "conflict" ? "conflict" : "failed");
        setMessage(r.error.message);
        return;
      }
      version.current = r.data.version;
    }
    setState("saved");
    setMessage(null);
  }, [save, merge]);

  const schedule = useCallback(
    (patch: P, delay = 1200) => {
      pending.current = pending.current ? merge(pending.current, patch) : patch;
      setState((s) => (s === "conflict" ? s : "saving"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush, merge],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || inFlight.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return { state, message, schedule, flush, version, setVersion: (v: number) => (version.current = v) };
}

export function SaveStatus({ state, message, onRetry, copyText }: { state: SaveState; message: string | null; onRetry: () => void; copyText: () => string }) {
  if (state === "saving") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    );
  }
  if (state === "saved" || state === "idle") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-zinc-600">
        <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> {state === "saved" ? "Saved" : "All changes saved"}
      </span>
    );
  }
  return (
    <span role="alert" className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 py-1 pr-1 pl-3 text-[13px] text-red-800">
      {state === "conflict" ? "Changed in another tab — reload to see the latest. Nothing was overwritten." : message ?? "Couldn't save. Your text is still here."}
      {state === "conflict" ? (
        <Button size="sm" variant="outline" className="h-7" onClick={() => window.location.reload()}>Reload</Button>
      ) : (
        <Button size="sm" variant="outline" className="h-7" onClick={onRetry}>Retry</Button>
      )}
      <Button size="sm" variant="outline" className="h-7" onClick={() => navigator.clipboard.writeText(copyText())}>Copy text</Button>
    </span>
  );
}
