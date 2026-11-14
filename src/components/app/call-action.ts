"use client";

import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { fail, type ActionResult } from "@/lib/result";

export const OFFLINE_MESSAGE = "Couldn't reach the server — check your connection and try again. Nothing you typed was lost.";

/**
 * Call a server action from the browser without ever losing the page: a dropped
 * connection, an expired session or a new deploy comes back as a friendly
 * `{ ok: false }` instead of an error screen. Redirects still go through.
 */
export async function callAction<T>(fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T> | void> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // redirect() / notFound() from the action
    console.error(e);
    return fail("retry", OFFLINE_MESSAGE);
  }
}

/**
 * For one-click changes (a checkbox, a status button): run the action, and on failure
 * show why and let the caller put the screen back the way it was.
 */
export async function quickAction<T>(fn: () => Promise<ActionResult<T> | void>, onFail?: () => void): Promise<boolean> {
  const r = await callAction(fn);
  if (r && r.ok === false) {
    toast.error(r.error.message === OFFLINE_MESSAGE ? "Couldn't save — check your connection and try again." : r.error.message);
    onFail?.();
    return false;
  }
  return true;
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Couldn't copy — select the text and copy it yourself."),
  );
}
