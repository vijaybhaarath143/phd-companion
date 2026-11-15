"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSonner } from "sonner";
import { X } from "lucide-react";
import { cn } from "cn";
import { Sprig, type SprigMood } from "@/components/app/sprig";
import {
  Particles,
  useReducedMotion,
  useSprigEyes,
  useSprigReaction,
  useTapPlay,
  type SprigReaction,
  type SprigTrick,
} from "@/components/app/sprig-live";
import { SPRIG_CUE, type SprigCue } from "@/components/app/sprig-bus";
import {
  CHEERS,
  DIZZY_LINE,
  DONE_LINES,
  OOPS_LINES,
  PEEKABOO_LINE,
  TAP_LINES,
  TRICK_LINES,
  TUCKED_LINE,
  WAKE_LINE,
  areaOf,
  pageLine,
  pick,
} from "@/components/app/sprig-lines";

/**
 * Sprig, the companion in the corner of every page. It's always there, and always a little alive:
 * - it breathes, blinks, sways and watches the pointer; now and then it waves, stretches or looks
 *   around on its own, and after two quiet minutes it dozes off until she comes back
 * - it pops up with a line the first time she opens each area in a visit
 * - it nods at every save, worries (kindly) when something fails, hops when a task is ticked off,
 *   and throws confetti for real milestones (instead of a toast)
 * - tap it: it plays and opens a bubble with Quick Add, Cheer me on, Do a trick and Tuck me away
 * - tucked away, only its leaves and eyes peek out; a tap brings it back, and it still pops up to
 *   celebrate. On a phone it ducks the same way while she's typing, so it never covers a field.
 * Reduced motion: faces and words only, no movement. It isn't printed.
 */

type Bubble = { text: string; detail?: string; menu?: boolean; tone?: "celebrate" | "oops" };

const TUCK_KEY = "sprig:tucked";
const GREETED_KEY = "sprig:greeted";
const WOKE_KEY = "sprig:woke";
const DOZE_AFTER = 120_000;
const PHONE = "(max-width: 767px)";

const IDLE_DAY: readonly (SprigReaction | "look")[] = [
  { mood: "hello", ms: 2300 },
  { mood: "proud", trick: "squish", ms: 1200 },
  { trick: "hop" },
  "look",
  { mood: "curious", ms: 1800 },
  { mood: "love", particles: "hearts", ms: 1500 },
  { trick: "wiggle" },
];
const IDLE_NIGHT: readonly (SprigReaction | "look")[] = [{ mood: "yawn", trick: "squish", ms: 1900 }, "look", { mood: "cosy", ms: 4000 }];
const TRICKS: readonly SprigTrick[] = ["flip", "spin", "dance", "squish"];

function readStore(storage: "local" | "session", key: string) {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function writeStore(storage: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // private window or blocked storage: Sprig just forgets
  }
}

/** A text field she types into (where the on-screen keyboard comes up on a phone). */
function isTextField(el: EventTarget | null) {
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable || el.matches("textarea, select, input:not([type=checkbox], [type=radio], [type=button], [type=submit], [type=reset], [type=range], [type=file], [type=color])"))
  );
}

function Chip({ onClick, children, primary }: { onClick: () => void; children: ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border-2 px-3 font-display text-[13px] font-extrabold transition-colors outline-none focus-visible:ring-4 focus-visible:ring-sky-soft",
        primary ? "border-primary bg-primary text-primary-foreground hover:bg-leaf-strong" : "bg-card text-foreground hover:bg-zinc-100",
      )}
    >
      {children}
    </button>
  );
}

export function SprigDock({ onQuickAdd }: { onQuickAdd?: () => void }) {
  const path = usePathname();
  const still = useReducedMotion();
  const { reaction, perform } = useSprigReaction();
  const play = useTapPlay(perform);
  const bubbleId = useId();

  const [ready, setReady] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [poppedOut, setPoppedOut] = useState(false); // out of its tuck for a moment (a celebration)
  const [typing, setTyping] = useState(false); // on a phone, ducks while she types
  const [dozing, setDozing] = useState(false);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLButtonElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const popTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastCueAt = useRef(0); // when the app last cued Sprig directly
  // the latest state, for listeners that outlive a render
  const live = useRef({ tucked, dozing, bubble, poppedOut });
  useEffect(() => {
    live.current = { tucked, dozing, bubble, poppedOut };
  });

  useSprigEyes(spriteRef, !still && !dozing);

  const say = useCallback((b: Bubble | null, ms?: number) => {
    clearTimeout(bubbleTimer.current);
    setBubble(b);
    if (b && ms) bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);
  /** Close the bubble; if focus was in it, give focus back to Sprig rather than losing it. */
  const closeBubble = useCallback(() => {
    const focusInside = rootRef.current?.contains(document.activeElement) ?? false;
    say(null);
    if (focusInside) spriteRef.current?.focus();
  }, [say]);
  // a repeated line still gets read out (a live region ignores an unchanged text)
  const announce = useCallback((text: string) => setAnnouncement((prev) => (prev === text ? `${text} ` : text)), []);

  const tuck = useCallback((on: boolean) => {
    setTucked(on);
    writeStore("local", TUCK_KEY, on ? "1" : null);
  }, []);

  /** Out of its tuck for a moment, then back in. */
  const popOut = useCallback((ms: number) => {
    setPoppedOut(true);
    clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setPoppedOut(false), ms);
  }, []);

  const wake = useCallback(() => {
    if (!live.current.dozing) return; // many events can arrive before the next render
    live.current.dozing = false;
    setDozing(false);
    perform({ mood: "curious", trick: "startle", ms: 1400 });
    // the joke once per visit; after that just the startle (she may step away dozens of times a day)
    if (!live.current.tucked && !live.current.bubble && readStore("session", WOKE_KEY) === null) {
      writeStore("session", WOKE_KEY, "1");
      say({ text: WAKE_LINE }, 3500);
    }
  }, [perform, say]);

  // Arrive: remember whether she tucked Sprig away last time, then pop in with a wave.
  useEffect(() => {
    const wasTucked = readStore("local", TUCK_KEY) === "1";
    const t = setTimeout(() => {
      setTucked(wasTucked);
      setReady(true);
      if (!wasTucked) perform({ mood: "hello", trick: "pop", ms: 2400 });
    }, 0);
    return () => {
      clearTimeout(t);
      clearTimeout(bubbleTimer.current);
      clearTimeout(popTimer.current);
    };
  }, [perform]);

  // A line the first time she opens each area in this visit; a nod after that.
  useEffect(() => {
    if (!ready) return;
    const area = areaOf(path) || "home";
    const t = setTimeout(() => {
      // tucked away, or already saying something: no greeting (and it's still owed next time)
      if (live.current.tucked || live.current.bubble) return;
      const greeted = new Set((readStore("session", GREETED_KEY) ?? "").split(",").filter(Boolean));
      if (greeted.has(area)) {
        perform({ trick: "nod", ms: 600 });
        return;
      }
      greeted.add(area);
      writeStore("session", GREETED_KEY, [...greeted].join(","));
      perform({ mood: "hello", trick: "hop", ms: 2400 });
      say({ text: pageLine(path, new Date()) }, 6500);
    }, 900);
    return () => clearTimeout(t);
  }, [path, ready, perform, say]);

  // Cues from the rest of the app: a real milestone, or a task ticked off.
  useEffect(() => {
    const onCue = (e: Event) => {
      const cue = (e as CustomEvent<SprigCue>).detail;
      if (!cue) return;
      lastCueAt.current = Date.now();
      live.current.dozing = false;
      setDozing(false);
      if (cue.kind === "celebrate") {
        // out of a tuck or a duck (she may still be in a field on a phone): this one must be seen
        popOut(5600);
        perform({ mood: "proud", trick: "flip", particles: "confetti", ms: 3200 });
        say({ text: cue.title, detail: cue.detail, tone: "celebrate" }, 5600);
        announce(cue.detail ? `${cue.title}. ${cue.detail}` : cue.title);
      } else {
        perform({ mood: "proud", trick: "hop", particles: "sparkles", ms: 1500 });
        if (!live.current.tucked && !live.current.bubble?.menu) say({ text: pick(DONE_LINES) }, 2400);
      }
    };
    window.addEventListener(SPRIG_CUE, onCue);
    return () => window.removeEventListener(SPRIG_CUE, onCue);
  }, [perform, say, announce, popOut]);

  // Every save shows a toast: Sprig nods at the good ones and is kind about the failed ones.
  // Sonner adds toasts one render at a time, so new ones are gathered for a moment and answered
  // once — a failure wins over a success shown with it (an entry saved, but its file didn't upload).
  // Keyed by id and type, so a toast that turns from one kind into another still counts.
  const { toasts } = useSonner();
  const seenToasts = useRef(new Set<string>());
  const pendingToasts = useRef({ error: false, success: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const keys = toasts.map((t) => ({ key: `${t.id}:${t.type ?? "default"}`, type: t.type }));
    const fresh = keys.filter((k) => !seenToasts.current.has(k.key));
    seenToasts.current = new Set(keys.map((k) => k.key)); // only what's still on screen
    for (const f of fresh) {
      if (f.type === "error") pendingToasts.current.error = true;
      if (f.type === "success") pendingToasts.current.success = true;
    }
    if (!pendingToasts.current.error && !pendingToasts.current.success) return;
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      const p = pendingToasts.current;
      pendingToasts.current = { error: false, success: false };
      if (p.error) {
        perform({ mood: "oops", trick: "shake", ms: 3400 });
        const s = live.current;
        if (!s.tucked && !s.bubble?.menu && s.bubble?.tone !== "celebrate") say({ text: pick(OOPS_LINES), tone: "oops" }, 4800);
      } else if (Date.now() - lastCueAt.current > 800) {
        // a cue (a task ticked off) has its own, bigger reaction; don't nod over it
        perform({ mood: "happy", trick: "nod", ms: 900 });
      }
    }, 60);
  }, [toasts, perform, say]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Now and then, Sprig does something on its own.
  useEffect(() => {
    if (still) return;
    let next: ReturnType<typeof setTimeout>;
    const glances: ReturnType<typeof setTimeout>[] = [];
    const lookAround = () => {
      const el = spriteRef.current;
      if (!el) return;
      const steps: [number, number, number][] = [[-3.2, 0, 0], [3.2, 0, 700], [0, -2.5, 1400], [0, 0, 2000]];
      for (const [x, y, at] of steps) {
        glances.push(
          setTimeout(() => {
            el.style.setProperty("--sprig-lx", `${x}px`);
            el.style.setProperty("--sprig-ly", `${y}px`);
          }, at),
        );
      }
    };
    const run = () => {
      const s = live.current;
      if (!document.hidden && !s.tucked && !s.dozing && !s.bubble) {
        const hour = new Date().getHours();
        const action = pick(hour >= 23 || hour < 5 ? IDLE_NIGHT : IDLE_DAY);
        if (action === "look") lookAround();
        else perform(action);
      }
      next = setTimeout(run, 15_000 + Math.random() * 20_000);
    };
    next = setTimeout(run, 15_000 + Math.random() * 20_000);
    return () => {
      clearTimeout(next);
      for (const g of glances) clearTimeout(g);
    };
  }, [still, perform]);

  // Two quiet minutes and Sprig dozes off; any movement wakes it.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let last = 0;
    const restart = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!document.hidden && !live.current.bubble) setDozing(true);
      }, DOZE_AFTER);
    };
    const onActivity = () => {
      wake();
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      restart();
    };
    const events = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });
    restart();
    return () => {
      clearTimeout(t);
      for (const ev of events) window.removeEventListener(ev, onActivity);
    };
  }, [wake]);

  // On a phone, duck while she types, so Sprig never sits on a field or the keyboard.
  useEffect(() => {
    const phone = window.matchMedia(PHONE);
    const onIn = (e: FocusEvent) => {
      if (phone.matches && isTextField(e.target) && !rootRef.current?.contains(e.target as Node)) setTyping(true);
    };
    const onOut = () => {
      // focus moves after focusout; look at where it landed
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setTyping(false);
      }, 0);
    };
    window.addEventListener("focusin", onIn);
    window.addEventListener("focusout", onOut);
    // a field that focused itself as the page loaded (autofocus) did so before we were listening
    const already = setTimeout(() => {
      if (phone.matches && isTextField(document.activeElement)) setTyping(true);
    }, 0);
    return () => {
      clearTimeout(already);
      window.removeEventListener("focusin", onIn);
      window.removeEventListener("focusout", onOut);
    };
  }, []);

  // Esc or a click elsewhere closes the menu bubble.
  useEffect(() => {
    if (!bubble?.menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeBubble();
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) say(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [bubble?.menu, say, closeBubble]);

  const awayInTuck = tucked && !poppedOut;
  const peeking = (tucked || typing) && !poppedOut;
  const showBubble = bubble !== null && !peeking;

  const onTap = () => {
    if (dozing) {
      wake();
      return;
    }
    if (awayInTuck) {
      tuck(false);
      perform({ mood: "hello", trick: "pop", ms: 2200 });
      say({ text: PEEKABOO_LINE, menu: true });
      announce(PEEKABOO_LINE);
      return;
    }
    const line = play() === "dizzy" ? DIZZY_LINE : pick(TAP_LINES);
    say({ text: line, menu: true });
    announce(line);
  };

  // Hovering over Sprig gets a wave (at most every few seconds).
  const lastWave = useRef(0);
  const onHover = () => {
    if (reaction || peeking || dozing || Date.now() - lastWave.current < 6000) return;
    lastWave.current = Date.now();
    perform({ mood: "hello", ms: 1800 });
  };

  const mood: SprigMood = reaction?.mood ?? (dozing ? "cosy" : "happy");

  return (
    // In the page, Sprig comes first and its bubble after it (so Tab goes from Sprig into the
    // bubble's buttons); on screen the bubble sits above.
    <div
      ref={rootRef}
      data-sprig-dock
      className={cn(
        "pointer-events-none fixed right-3 bottom-[calc(max(env(safe-area-inset-bottom),8px)+70px)] z-30 flex flex-col-reverse items-end print:hidden md:right-6 md:bottom-5",
        !ready && "invisible",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto relative transition-transform duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none",
          peeking && "translate-y-[36%] md:translate-y-[calc(36%+20px)]",
        )}
      >
        <button
          ref={spriteRef}
          type="button"
          onClick={onTap}
          onPointerEnter={(e) => e.pointerType === "mouse" && onHover()}
          aria-label={awayInTuck ? "Bring Sprig back" : "Sprig, your companion"}
          aria-expanded={showBubble && bubble.menu ? true : false}
          aria-controls={showBubble && bubble.menu ? bubbleId : undefined}
          className="group relative block w-16 cursor-pointer rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-sky-soft md:w-[76px]"
        >
          <span key={`sprig-${reaction?.key ?? "rest"}`} data-trick={reaction?.trick} className="sprig-trick block">
            <Sprig mood={mood} lively={!dozing && !peeking} className="w-full transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none" />
          </span>
          {reaction?.particles && !still && <Particles key={`particles-${reaction.key}`} kind={reaction.particles} />}
        </button>
      </div>
      {showBubble && (
        <div
          id={bubbleId}
          role="group"
          aria-label="Sprig"
          className={cn(
            "relative mr-1 mb-2 w-[min(280px,calc(100vw-24px))] origin-bottom-right rounded-2xl border-2 bg-card p-3.5 shadow-edge motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90 motion-safe:slide-in-from-bottom-2",
            bubble.menu ? "pointer-events-auto" : "pointer-events-none",
            bubble.tone === "celebrate" && "border-leaf-soft shadow-[0_4px_0_var(--leaf-soft)]",
            bubble.tone === "oops" && "border-sky-soft shadow-[0_4px_0_var(--sky-soft)]",
          )}
        >
          {bubble.menu && (
            <button
              type="button"
              aria-label="Close"
              onClick={closeBubble}
              className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-zinc-100 hover:text-foreground focus-visible:ring-4 focus-visible:ring-sky-soft"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
          <p className={cn("line-clamp-3 pr-6 font-display text-[15px] leading-snug font-extrabold", bubble.tone === "celebrate" && "text-leaf-strong")}>{bubble.text}</p>
          {bubble.detail && <p className="mt-0.5 line-clamp-3 text-[13px] text-muted-foreground">{bubble.detail}</p>}
          {bubble.menu && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {onQuickAdd && (
                <Chip
                  primary
                  onClick={() => {
                    // focus Sprig first, so Quick Add hands focus back to it (not the page top) on close
                    spriteRef.current?.focus();
                    say(null);
                    onQuickAdd();
                  }}
                >
                  Quick Add
                </Chip>
              )}
              <Chip
                onClick={() => {
                  const line = pick(CHEERS);
                  perform({ mood: "love", trick: "dance", particles: "hearts", ms: 2200 });
                  say({ text: line, menu: true });
                  announce(line);
                }}
              >
                Cheer me on
              </Chip>
              <Chip
                onClick={() => {
                  const line = pick(TRICK_LINES);
                  perform({ mood: "proud", trick: pick(TRICKS), particles: "sparkles", ms: 1800 });
                  say({ text: line, menu: true });
                  announce(line);
                }}
              >
                Do a trick
              </Chip>
              <Chip
                onClick={() => {
                  closeBubble();
                  perform({ mood: "cosy", ms: 1200 });
                  tuck(true);
                  announce(TUCKED_LINE);
                }}
              >
                Tuck me away
              </Chip>
            </div>
          )}
          <span aria-hidden className="absolute right-7 -bottom-[9px] size-4 rotate-45 border-r-2 border-b-2 bg-card" />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
