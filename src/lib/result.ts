export type ActionError = { kind: "validation" | "conflict" | "not_found" | "retry"; message: string };
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ActionError };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (kind: ActionError["kind"], message: string): ActionResult<never> => ({
  ok: false,
  error: { kind, message },
});

export function friendlyDbError(e: unknown): ActionResult<never> {
  const err = e as { code?: string; message?: string };
  if (err?.code === "23514" && err.message?.includes("wait on itself")) {
    return fail("validation", "A task can't wait on itself, directly or through other tasks.");
  }
  if (err?.code === "23514" || err?.code === "23502") return fail("validation", "Some details aren't valid. Please check and try again.");
  if (err?.code === "23503") return fail("validation", "That link isn't allowed.");
  if (err?.message?.includes("another tab")) return fail("conflict", err.message);
  console.error(e);
  return fail("retry", "Couldn't save. Your text is still here — try again.");
}
