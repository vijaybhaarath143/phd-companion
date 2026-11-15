"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { Heart, Sparkle } from "lucide-react";
import { cn } from "cn";
import { Sprig, type SprigMood, type SprigStage } from "@/components/app/sprig";

/**
 * Sprig, alive: it breathes, blinks, sways its leaves, follows the pointer with its eyes (or the
 * field being typed in, on a phone), and plays when it's tapped. Under reduced motion it keeps its
 * faces but stands still. The companion in the corner (sprig-dock.tsx) is built from these pieces.
 */

export type SprigTrick = "hop" | "spin" | "wiggle" | "squish" | "flip" | "shake" | "wobble" | "pop" | "dance" | "nod" | "startle";
export type ParticleKind = "hearts" | "sparkles" | "confetti";
export type SprigReaction = { mood?: SprigMood; trick?: SprigTrick; particles?: ParticleKind; ms?: number };

/** Each tap plays the next one. */
export const TAP_REACTIONS: readonly SprigReaction[] = [
  { mood: "proud", trick: "hop", particles: "sparkles" },
  { mood: "love", trick: "wiggle", particles: "hearts" },
  { mood: "hello", trick: "spin" },
  { mood: "happy", trick: "squish" },
  { mood: "proud", trick: "flip", particles: "sparkles" },
  { mood: "curious", trick: "wobble" },
];
export const DIZZY: SprigReaction = { mood: "dizzy", trick: "wobble", ms: 2600 };

const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCE).matches, () => false);
}

/** Point Sprig's pupils (inside `ref`) at the pointer, or at the field that just got focus. */
export function useSprigEyes(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let frame = 0;
    let target: { x: number; y: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!target) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const dx = target.x - (r.left + r.width / 2);
      const dy = target.y - (r.top + r.height * 0.65); // the eyes sit about two thirds down
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / 140);
      el.style.setProperty("--sprig-lx", `${((dx / d) * 3.2 * reach).toFixed(2)}px`);
      el.style.setProperty("--sprig-ly", `${((dy / d) * 3 * reach).toFixed(2)}px`);
    };
    const look = (x: number, y: number) => {
      target = { x, y };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") look(e.clientX, e.clientY);
    };
    const onFocus = (e: FocusEvent) => {
      if (!(e.target instanceof HTMLElement) || e.target === document.body || el.contains(e.target)) return;
      const r = e.target.getBoundingClientRect();
      look(r.left + r.width / 2, r.top + r.height / 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("focusin", onFocus);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("focusin", onFocus);
      cancelAnimationFrame(frame);
    };
  }, [ref, enabled]);
}

/** Play a reaction for a moment, then go back to the resting face. */
export function useSprigReaction() {
  const [reaction, setReaction] = useState<(SprigReaction & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counter = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const perform = useCallback((r: SprigReaction) => {
    counter.current += 1;
    setReaction({ ...r, key: counter.current });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setReaction(null), r.ms ?? 1500);
  }, []);
  return { reaction, perform };
}

/** A tap plays the next reaction; five quick taps make Sprig dizzy. */
export function useTapPlay(perform: (r: SprigReaction) => void) {
  const taps = useRef<number[]>([]);
  const next = useRef(0);
  return useCallback((): "tap" | "dizzy" => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      perform(DIZZY);
      return "dizzy";
    }
    perform(TAP_REACTIONS[next.current % TAP_REACTIONS.length]);
    next.current += 1;
    return "tap";
  }, [perform]);
}

const CONFETTI = [
  { className: "size-2.5 rounded-[3px] bg-sun-bright", x: -46, y: -40, r: 40 },
  { className: "h-3.5 w-2 rounded-[3px] bg-sky", x: 42, y: -48, r: -35 },
  { className: "size-2.5 rounded-full bg-grape", x: 50, y: -6, r: 0 },
  { className: "h-2 w-3 rounded-[3px] bg-berry-bright", x: -48, y: 0, r: -25 },
  { className: "size-2 rounded-full bg-leaf-bright", x: 0, y: -66, r: 0 },
  { className: "size-2 rounded-full bg-sun-bright", x: 28, y: -66, r: 0 },
  { className: "size-2 rounded-full bg-sky", x: -26, y: -64, r: 0 },
  { className: "size-2.5 rounded-[3px] bg-berry-bright", x: 36, y: 20, r: 30 },
  { className: "h-3 w-1.5 rounded-[3px] bg-grape", x: -36, y: 22, r: 60 },
];

/** Hearts or sparkles floating up, or confetti flying out — decoration around a reaction. */
export function Particles({ kind }: { kind: ParticleKind }) {
  if (kind === "confetti") {
    return (
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2">
        {CONFETTI.map((p, i) => (
          <span
            key={i}
            className={cn("absolute animate-[celebrate-pop_700ms_ease-out_both]", p.className)}
            style={{ "--cx": `${p.x}px`, "--cy": `${p.y}px`, "--cr": `${p.r}deg`, animationDelay: `${i * 35}ms` } as CSSProperties}
          />
        ))}
      </span>
    );
  }
  const Icon = kind === "hearts" ? Heart : Sparkle;
  return (
    <span aria-hidden className="pointer-events-none absolute top-[18%] left-1/2">
      {[-1, 0, 1].map((d, i) => (
        <Icon
          key={d}
          className={cn(
            "absolute size-3.5 animate-[sprig-float-up_1.1s_ease-out_both]",
            kind === "hearts" ? "fill-berry-bright text-berry-bright" : "fill-sun-bright text-sun-bright",
          )}
          style={{ "--px": `${d * 9}px`, animationDelay: `${i * 140}ms`, left: `${d * 10 - 7}px` } as CSSProperties}
        />
      ))}
    </span>
  );
}

/**
 * A Sprig that's alive and can be played with: tap it and it hops, spins, flips or sends hearts.
 * For the screens where Sprig appears in the page itself (sign-in, onboarding, empty states,
 * not found, "Step done").
 *
 * It's decoration you can play with by mouse or touch, deliberately not a tab stop or a screen-reader
 * button: tapping it only animates, so as a button it would just stand between her and the form
 * (on sign-in it would come before the email field). The companion in the corner is the Sprig with
 * a keyboard-reachable menu and words that are read out.
 */
export function LiveSprig({ mood = "happy", stage = "sprout", className }: { mood?: SprigMood; stage?: SprigStage; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const still = useReducedMotion();
  useSprigEyes(ref, !still);
  const { reaction, perform } = useSprigReaction();
  const play = useTapPlay(perform);
  return (
    <span ref={ref} aria-hidden onClick={() => play()} className={cn("relative inline-block w-32 shrink-0 cursor-pointer select-none", className)}>
      <span key={`sprig-${reaction?.key ?? "rest"}`} data-trick={reaction?.trick} className="sprig-trick block">
        <Sprig mood={reaction?.mood ?? mood} stage={stage} lively className="w-full" />
      </span>
      {reaction?.particles && !still && <Particles key={`particles-${reaction.key}`} kind={reaction.particles} />}
    </span>
  );
}
