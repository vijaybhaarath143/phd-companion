/**
 * How the rest of the app calls Sprig (the companion in the corner, sprig-dock.tsx) without
 * importing it: a browser event. Saved and failed toasts are noticed on their own; these cues are
 * for moments a toast doesn't cover.
 */
export type SprigCue = { kind: "celebrate"; title: string; detail?: string } | { kind: "done" };

export const SPRIG_CUE = "sprig:cue";

/**
 * Is the companion on this page, where she can see it? Celebrations go to it when it is, and to a
 * toast when it isn't — including when a dialog or drawer covers it (Radix hides everything outside
 * an open modal with aria-hidden, and its overlay sits on top of Sprig).
 */
export function sprigIsHere() {
  if (typeof document === "undefined") return false;
  const dock = document.querySelector("[data-sprig-dock]");
  if (!dock) return false;
  const covered = dock.closest("[aria-hidden='true'], [inert]") !== null || document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']") !== null;
  return !covered;
}

export function cueSprig(cue: SprigCue) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SprigCue>(SPRIG_CUE, { detail: cue }));
}
