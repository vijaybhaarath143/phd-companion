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

/**
 * Move something to Trash (or remove it) at once and offer Undo, instead of asking first —
 * it can all be brought back. The toast goes up before the action runs because some trash
 * actions redirect, and nothing after them would get the chance; Undo waits for the action
 * to finish, so an early click can't arrive first.
 */
export async function trashWithUndo({
  what,
  note,
  trash,
  undo,
  onUndone,
  removed = false,
}: {
  /** "Entry", "Task"… */
  what: string;
  /** An extra line, e.g. what moving it to Trash changes. */
  note?: string;
  trash: () => Promise<ActionResult<unknown> | void>;
  undo: () => Promise<ActionResult<unknown> | void>;
  /** After a successful undo, e.g. go back to the page it was trashed from. */
  onUndone?: () => void;
  /** Removed from its list rather than moved to Trash (a trial, a step, a deadline). */
  removed?: boolean;
}): Promise<boolean> {
  let id: string | number = 0;
  // resolves true once the action is done (a redirect means it was), false if it failed
  const finished = quickAction(trash, () => toast.dismiss(id));
  const settled = finished.catch(() => true);
  id = toast(removed ? `${what} removed` : `${what} moved to Trash`, {
    description: note ?? (removed ? undefined : "Settings → Trash keeps it for 30 days."),
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: () => {
        void settled.then(async (done) => {
          if (!done) return;
          if (!(await quickAction(undo))) return;
          toast.success(`${what} restored`);
          onUndone?.();
        });
      },
    },
  });
  return finished;
}

export function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Couldn't copy — select the text and copy it yourself."),
  );
}
