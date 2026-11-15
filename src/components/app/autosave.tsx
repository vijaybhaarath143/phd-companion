"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fail, type ActionResult } from "@/lib/result";
import { copyToClipboard } from "@/components/app/call-action";

export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

/**
 * Debounced autosave. Changes are merged and sent ~1.2s after typing stops (or
 * immediately for choices). The server rejects stale versions, so another tab's
 * newer changes are never overwritten — we show a conflict instead.
 *
 * Nothing typed is ever dropped: if a save fails (even because the network or the
 * server is down), the change goes back in the queue and Retry / Copy text appear.
 * `flush()` resolves once everything queued has been sent (it waits for a save
 * already on its way first), with `true` when it all saved.
 */
export function useAutosave<P extends Record<string, unknown>, R extends { version: number } = { version: number }>(
  initialVersion: number,
  save: (version: number, patch: P) => Promise<ActionResult<R>>,
  merge: (a: P, b: P) => P,
) {
  const version = useRef(initialVersion);
  const pending = useRef<P | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const conflicted = useRef(false);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // the latest callbacks, so a save already on its way uses current code
  const saveRef = useRef(save);
  const mergeRef = useRef(merge);
  useEffect(() => {
    saveRef.current = save;
    mergeRef.current = merge;
  });

  const send = useCallback(async (): Promise<boolean> => {
    // Send queued changes one batch at a time until nothing is left.
    while (pending.current) {
      const patch: P = pending.current;
      pending.current = null;
      setState("saving");
      let r: ActionResult<R>;
      try {
        r = await saveRef.current(version.current, patch);
      } catch (e) {
        unstable_rethrow(e);
        r = fail("retry", "Couldn't reach the server — check your connection. Your text is still here.");
      }
      if (!r.ok) {
        // keep the unsent change so Retry can resend it
        pending.current = pending.current ? mergeRef.current(patch, pending.current) : patch;
        conflicted.current = r.error.kind === "conflict";
        setState(conflicted.current ? "conflict" : "failed");
        setMessage(r.error.message);
        return false;
      }
      version.current = r.data.version;
    }
    setState("saved");
    setMessage(null);
    return true;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // A save is already on its way: wait for it, then send whatever was typed meanwhile.
    while (inFlight.current) {
      const ok = await inFlight.current;
      if (!ok) return false;
    }
    if (!pending.current) return !conflicted.current;
    if (conflicted.current) return false; // resending would only conflict again
    const run = send();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, [send]);

  const retry = useCallback(() => {
    conflicted.current = false;
    return flush();
  }, [flush]);

  const schedule = useCallback(
    (patch: P, delay = 1200) => {
      pending.current = pending.current ? mergeRef.current(pending.current, patch) : patch;
      setState((s) => (s === "conflict" ? s : "saving"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
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

  // Leaving the page inside the app (another note, a link) doesn't fire beforeunload: send
  // whatever is still queued instead of dropping it when the editor goes away.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current && !conflicted.current) void flush();
  }, [flush]);

  const setVersion = useCallback((v: number) => {
    version.current = v;
  }, []);

  return { state, message, schedule, flush, retry, version, setVersion };
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
    <span role="alert" className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-overdue py-1 pr-1 pl-3 text-[13px] text-overdue-foreground">
      {state === "conflict" ? "Changed in another tab or device — copy your text, then reload to see the latest. Nothing was overwritten." : message ?? "Couldn't save. Your text is still here."}
      {state === "conflict" ? (
        <Button size="sm" variant="outline" className="h-7" onClick={() => window.location.reload()}>Reload</Button>
      ) : (
        <Button size="sm" variant="outline" className="h-7" onClick={onRetry}>Retry</Button>
      )}
      <Button size="sm" variant="outline" className="h-7" onClick={() => copyToClipboard(copyText())}>Copy text</Button>
    </span>
  );
}
