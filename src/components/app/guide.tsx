"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronRight, Compass, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useQuickAdd } from "@/components/app/quick-add";
import { GUIDE_CHAPTERS, GUIDE_STEPS, onStepPage, stepsFor, type GuideChapterId, type GuideStep } from "@/lib/guide";

/* ── What she has seen, remembered on this device ─────────────────────────── */

type Saved = { seen: GuideChapterId[]; dismissed?: boolean; resume?: { chapter: GuideChapterId | null; index: number } | null };
const KEY = "phd-companion:guide:v1";
const listeners = new Set<() => void>();
let memory: string | null = null; // used when the browser blocks storage

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function parse(raw: string | null): Saved {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.seen) ? v : { seen: [] };
  } catch {
    return { seen: [] };
  }
}
function save(update: (s: Saved) => Saved) {
  const next = JSON.stringify(update(parse(readRaw())));
  memory = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: keep it in memory for this visit */
  }
  listeners.forEach((l) => l());
}
function useSaved(): Saved {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parse(raw), [raw]);
}

const phoneQuery = "(max-width: 767px)";
function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(phoneQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}

/* ── Provider ─────────────────────────────────────────────────────────────── */

type Run = { chapter: GuideChapterId | null; index: number };
type Ctx = { openMenu: () => void; start: (chapter: GuideChapterId | null, index?: number) => void; running: boolean };
const GuideContext = createContext<Ctx>({ openMenu: () => {}, start: () => {}, running: false });
export const useGuide = () => useContext(GuideContext);

export function GuideProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  // Where focus was before the guide opened, so closing the tour puts it back there.
  const opener = useRef<HTMLElement | null>(null);

  const openMenu = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMenu(true);
  }, []);
  const start = useCallback(
    (chapter: GuideChapterId | null, index = 0) => {
      // started straight from a button (not the topic list): that button is where focus returns
      if (!menu) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMenu(false);
      setRun({ chapter, index });
      save((s) => ({ ...s, dismissed: true, resume: { chapter, index } }));
    },
    [menu],
  );
  const value = useMemo(() => ({ openMenu, start, running: run !== null }), [openMenu, start, run]);

  const running = run !== null;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      const el = opener.current;
      // after the page settles (the tour may have moved to another page); a dialog the
      // tour opened (Quick Add) keeps its own focus
      window.setTimeout(() => {
        if (document.activeElement?.closest("[role=dialog]")) return;
        (el && el.isConnected ? el : document.querySelector<HTMLElement>("main"))?.focus({ preventScroll: true });
      }, 0);
    }
    wasRunning.current = running;
  }, [running]);

  return (
    <GuideContext value={value}>
      {children}
      <GuideMenu open={menu} onOpenChange={setMenu} onStart={start} />
      {run && <Tour run={run} setRun={setRun} />}
    </GuideContext>
  );
}

/* ── The topic list behind "Guide me" ─────────────────────────────────────── */

function GuideMenu({ open, onOpenChange, onStart }: { open: boolean; onOpenChange: (o: boolean) => void; onStart: (c: GuideChapterId | null, i?: number) => void }) {
  const saved = useSaved();
  const resume = saved.resume;
  const resumeSteps = resume ? stepsFor(resume.chapter) : [];
  const canResume = resume && resume.index > 0 && resume.index < resumeSteps.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]">
        <div className="flex flex-col gap-1">
          <DialogTitle className="text-lg font-semibold">Guide me</DialogTitle>
          <DialogDescription>
            A short walk through each part of the app, one idea at a time. Take the whole tour (about 5 minutes) or pick a topic.
          </DialogDescription>
        </div>

        <div className="flex flex-wrap gap-2">
          {canResume ? (
            <>
              <Button onClick={() => onStart(resume.chapter, resume.index)}>
                Continue where you left off <span className="font-normal opacity-80">· step {resume.index + 1} of {resumeSteps.length}</span>
              </Button>
              <Button variant="outline" onClick={() => onStart(null)}>Start from the beginning</Button>
            </>
          ) : (
            <Button onClick={() => onStart(null)}>Take the full tour</Button>
          )}
        </div>

        <ul className="-mx-1 flex flex-col">
          {GUIDE_CHAPTERS.map((c) => {
            const seen = saved.seen.includes(c.id);
            const count = stepsFor(c.id).length;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onStart(c.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold", seen ? "border-transparent bg-primary text-white" : "text-zinc-600")}
                  >
                    {seen ? <Check className="size-3.5" /> : GUIDE_CHAPTERS.indexOf(c) + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.title}</span>
                    <span className="block text-[13px] text-muted-foreground">{c.summary}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">{seen ? "Seen" : `${count} ${count === 1 ? "step" : "steps"}`}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/* ── The tour: highlight one part of the page, explain it ─────────────────── */

function Tour({ run, setRun }: { run: Run; setRun: (r: Run | null) => void }) {
  const { open: openQuickAdd } = useQuickAdd();
  const steps = stepsFor(run.chapter);
  const step = steps[run.index];
  const pathname = usePathname();

  const go = (index: number) => {
    const next = { chapter: run.chapter, index };
    setRun(next);
    save((s) => ({ ...s, resume: next }));
  };
  const markSeen = (chapter: GuideChapterId) => save((s) => (s.seen.includes(chapter) ? s : { ...s, seen: [...s.seen, chapter] }));

  const close = () => setRun(null); // progress is already saved, so Guide me offers to continue
  const next = () => {
    const following = steps[run.index + 1];
    if (!following || following.chapter !== step.chapter) markSeen(step.chapter);
    if (following) return go(run.index + 1);
    save((s) => ({ ...s, resume: null }));
    setRun(null);
  };
  const back = () => run.index > 0 && go(run.index - 1);

  // the topic after this one, offered at the end of a single-topic run
  const nextChapter = run.chapter ? GUIDE_CHAPTERS[GUIDE_CHAPTERS.findIndex((c) => c.id === run.chapter) + 1] : undefined;
  const last = run.index === steps.length - 1;
  const endOfEverything = last && step.id === GUIDE_STEPS[GUIDE_STEPS.length - 1].id;

  return (
    <StepView
      key={`${run.chapter}:${step.id}`}
      step={step}
      onPage={onStepPage(step, pathname)}
      position={`${GUIDE_CHAPTERS.find((c) => c.id === step.chapter)!.title} · ${run.index + 1} of ${steps.length}`}
      progress={(run.index + 1) / steps.length}
      canGoBack={run.index > 0}
      onBack={back}
      onClose={close}
      actions={
        endOfEverything ? (
          <>
            <Button variant="outline" onClick={next}>Finish</Button>
            <Button onClick={() => { next(); openQuickAdd(); }}>Record my first entry</Button>
          </>
        ) : last && nextChapter ? (
          <>
            <Button variant="outline" onClick={next}>Done</Button>
            <Button onClick={() => { markSeen(step.chapter); setRun({ chapter: nextChapter.id, index: 0 }); save((s) => ({ ...s, resume: { chapter: nextChapter.id, index: 0 } })); }}>
              Next: {nextChapter.title}
            </Button>
          </>
        ) : (
          <Button onClick={next}>{last ? "Done" : "Next"}</Button>
        )
      }
      onNext={next}
    />
  );
}

const PAD = 6; // space around the highlighted part
const GAP = 14; // space between the highlight and the explanation

function findVisible(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-guide~="${target}"]`)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

function StepView({
  step, onPage, position, progress, canGoBack, onBack, onNext, onClose, actions,
}: {
  step: GuideStep; onPage: boolean; position: string; progress: number; canGoBack: boolean;
  onBack: () => void; onNext: () => void; onClose: () => void; actions: ReactNode;
}) {
  const router = useRouter();
  const phone = useIsPhone();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [size, setSize] = useState({ w: 380, h: 240 });

  // 1. open the right page
  useEffect(() => {
    if (!onPage) router.push(step.path);
  }, [onPage, step.path, router]);

  // 2. find the part to highlight (pages can take a moment to appear), bring it into view, follow it
  useEffect(() => {
    if (!onPage) return;
    let el: HTMLElement | null = null;
    let timer = 0;
    const started = performance.now();
    const ro = new ResizeObserver(() => el && setRect(el.getBoundingClientRect()));
    const measure = () => el && setRect(el.getBoundingClientRect());
    const look = () => {
      el = step.target ? findVisible(step.target) : null;
      if (!el && step.target && performance.now() - started < 1500) {
        timer = window.setTimeout(look, 100);
        return;
      }
      if (el) {
        el.scrollIntoView({ block: phone ? "start" : "center", behavior: "smooth" });
        ro.observe(el);
        measure();
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
        setRect(null);
      }
      setReady(true);
    };
    look();
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [onPage, step.target, phone]);

  // the explanation's own size, to place it beside the highlight
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // keyboard: Esc closes, arrows move; focus starts on the step's heading
  useEffect(() => {
    if (ready) heading.current?.focus({ preventScroll: true });
  }, [ready]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onBack();
      else if (e.key === "Tab") {
        // keep keyboard focus inside the explanation while the tour is open
        const el = card.current;
        if (!el) return e.preventDefault();
        const focusable = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
        if (!focusable.length) return e.preventDefault();
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const inside = el.contains(document.activeElement);
        if (e.shiftKey && (!inside || document.activeElement === first || document.activeElement === heading.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // focus that lands outside (a click on the page behind, a screen reader jump) comes back
    const onFocusIn = (e: FocusEvent) => {
      const el = card.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) heading.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [onClose, onNext, onBack]);

  const style = placeCard(rect, size, phone);
  const body = phone && step.phoneBody ? step.phoneBody : step.body;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* click shield + dimming; the highlight is a hole cut out by a large shadow */}
      <div className={cn("absolute inset-0", !rect && "bg-zinc-950/55")} aria-hidden />
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-white transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgb(9 9 11 / 0.55)",
          }}
        />
      )}

      {ready && (
        <div
          ref={card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          aria-describedby="guide-body"
          style={style}
          className="absolute flex w-[min(380px,calc(100vw-24px))] flex-col gap-3 rounded-2xl border-2 bg-popover p-5 text-popover-foreground shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="pt-0.5 text-[12px] text-muted-foreground">{position}</p>
            <button type="button" onClick={onClose} aria-label="Close the guide" className="-mt-1.5 -mr-2 rounded-md p-1.5 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 ref={heading} id="guide-title" tabIndex={-1} className="text-[17px] leading-6 font-extrabold outline-none">{step.title}</h2>
            <p id="guide-body" className="text-[14px] leading-[1.55] text-zinc-700">{body}</p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canGoBack && <Button variant="ghost" onClick={onBack} className="mr-auto -ml-2">Back</Button>}
            {actions}
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">{ready ? `${step.title}. ${body}` : "Opening the next page"}</span>
    </div>
  );
}

/** Beside the highlight on a computer; at the top or bottom edge on a phone; centred when there's nothing to highlight. */
function placeCard(rect: DOMRect | null, size: { w: number; h: number }, phone: boolean): CSSProperties {
  if (typeof window === "undefined") return {};
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  if (phone) {
    const targetLow = rect.top + rect.height / 2 > vh * 0.55;
    return targetLow
      ? { top: "max(12px, env(safe-area-inset-top))", left: 12, right: 12, width: "auto" }
      : { bottom: "max(12px, env(safe-area-inset-bottom))", left: 12, right: 12, width: "auto" };
  }

  const { w, h } = size;
  const clampX = (x: number) => Math.min(Math.max(x, 16), vw - w - 16);
  const clampY = (y: number) => Math.min(Math.max(y, 16), vh - h - 16);
  const top = rect.top - PAD;
  const bottom = rect.bottom + PAD;
  if (bottom + GAP + h <= vh - 16) return { top: bottom + GAP, left: clampX(rect.left) };
  if (top - GAP - h >= 16) return { top: top - GAP - h, left: clampX(rect.left) };
  if (rect.right + PAD + GAP + w <= vw - 16) return { top: clampY(rect.top), left: rect.right + PAD + GAP };
  if (rect.left - PAD - GAP - w >= 16) return { top: clampY(rect.top), left: rect.left - PAD - GAP - w };
  return { bottom: 24, right: 24 };
}

/* ── Ways in ──────────────────────────────────────────────────────────────── */

/** Sidebar / More page button. */
export function GuideMeButton({ className, children }: { className?: string; children?: ReactNode }) {
  const { openMenu } = useGuide();
  return (
    <button type="button" onClick={openMenu} className={className}>
      {children ?? (
        <>
          <Compass className="size-4" aria-hidden /> Guide me
        </>
      )}
    </button>
  );
}

/** Shown on Home until she takes the tour or says "Not now". */
export function GuideInvite() {
  const saved = useSaved();
  const { openMenu, start, running } = useGuide();
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!hydrated || running || saved.dismissed || saved.seen.length > 0) return null;

  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
      <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Compass className="size-5 text-zinc-700" />
      </div>
      <div className="min-w-0 flex-[1_1_240px]">
        <h2 className="font-extrabold">New here? Let us show you around</h2>
        <p className="text-[13px] text-muted-foreground">A short tour of each part of the app, one idea at a time. About 5 minutes.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => save((s) => ({ ...s, dismissed: true }))}>Not now</Button>
        <Button variant="outline" onClick={openMenu}>Topics</Button>
        <Button onClick={() => start(null)}>Guide me</Button>
      </div>
    </section>
  );
}
