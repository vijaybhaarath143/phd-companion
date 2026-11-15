"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { ActionForm } from "@/components/app/action-form";
import { copyToClipboard, quickAction, trashWithUndo } from "@/components/app/call-action";
import { CelebrationBurst } from "@/components/app/celebrate";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { undoRemove } from "@/server/actions/settings";
import { toOptions } from "@/lib/options";
import { formatFullDay } from "@/lib/dates";
import { prismaCounts, reviewStepStatuses, type PrismaCount } from "@/lib/labels";
import { addReviewStep, removeReviewStep, setUpReviewSteps, toggleReviewStep, updateReviewStep } from "@/server/actions/research";
import type { ReviewStep } from "@/server/research";

const COUNT_LABEL: Record<PrismaCount, string> = {
  identified: "Records identified",
  duplicates_removed: "Duplicates removed",
  screened: "Records screened",
  excluded_screening: "Records excluded",
  full_text_retrieved: "Full texts retrieved",
  excluded_eligibility: "Reports excluded",
  included: "Studies included",
};

/** The review's steps as a path (done, the step she's on, what's next) beside the PRISMA numbers. */
export function ReviewSteps({ manuscriptId, steps, prisma }: { manuscriptId: string; steps: ReviewStep[]; prisma: Record<PrismaCount, number | null> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [celebrating, setCelebrating] = useState<{ step: ReviewStep; no: number; done: number; total: number; next: string | null } | null>(null);
  const [pending, start] = useTransition();

  if (!steps.length) {
    return (
      <section id="progress" data-guide="review-steps" className="flex scroll-mt-6 flex-col items-start gap-3 rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
        <h2 className="text-[15px] font-extrabold">Review milestones</h2>
        <p className="text-sm text-muted-foreground">
          Track this review step by step — protocol, search, screening, eligibility, extraction, PRISMA diagram, draft and feedback — with the
          numbers a PRISMA flow diagram needs. You can rename, skip or add steps afterwards.
        </p>
        <Button type="button" disabled={pending} onClick={() => start(async () => { await quickAction(() => setUpReviewSteps(manuscriptId)); })}>
          Set up the 11 review steps
        </Button>
      </section>
    );
  }

  const counted = steps.filter((s) => s.status !== "skipped");
  const done = counted.filter((s) => s.status === "done").length;
  const current = counted.find((s) => s.status === "in_progress") ?? counted.find((s) => s.status !== "done");
  const prismaText = (Object.keys(prismaCounts) as PrismaCount[]).map((k) => `${prismaCounts[k]}: ${prisma[k] ?? "not recorded"}`).join("\n");
  const toggle = (s: ReviewStep, next: boolean) =>
    start(async () => {
      if (!(await quickAction(() => toggleReviewStep(s.id, next))) || !next) return;
      const nowDone = done + (s.status === "done" ? 0 : 1);
      const after = counted.find((x) => x.id !== s.id && x.status !== "done" && x.sort > s.sort) ?? counted.find((x) => x.id !== s.id && x.status !== "done");
      setCelebrating({ step: s, no: steps.indexOf(s) + 1, done: nowDone, total: counted.length, next: after?.title ?? null });
    });
  const detail = (s: ReviewStep) =>
    [
      s.status === "done" ? (s.doneOn ? `Done ${formatFullDay(s.doneOn)}` : "Done") : reviewStepStatuses[s.status],
      s.countKind ? `${COUNT_LABEL[s.countKind].toLowerCase()}: ${s.count ?? "not recorded"}` : null,
    ].filter(Boolean).join(" · ");

  return (
    <div id="progress" data-guide="review-steps" className="flex scroll-mt-6 flex-wrap items-start gap-6">
      <StepDone
        info={celebrating}
        onClose={() => setCelebrating(null)}
        onNote={(id) => {
          setCelebrating(null);
          setEditing(id);
        }}
      />
      <section aria-label="Review steps" className="flex min-w-0 flex-[3_1_440px] flex-col rounded-2xl border-2 bg-card p-5 shadow-edge sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[22px]">Your path</h2>
          <div className="flex items-center gap-2">
            <Badge variant={done === counted.length ? "success" : "outline"}>{done} of {counted.length} done</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(!adding)}><Plus aria-hidden /> Add step</Button>
          </div>
        </div>

        <ol className="flex flex-col">
          {steps.map((s, i) => {
            const isCurrent = current?.id === s.id;
            const isDone = s.status === "done";
            const skipped = s.status === "skipped";
            const last = i === steps.length - 1;
            const lineDone = isDone && steps[i + 1]?.status === "done";
            return (
              <li key={s.id} className="flex flex-col">
                <div
                  className={cn(
                    "grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-4",
                    isCurrent && "rounded-2xl border-2 border-leaf-soft bg-[color-mix(in_srgb,var(--leaf-soft),white_45%)] py-4 pr-4",
                  )}
                >
                  <div className="flex justify-center">
                    {isDone ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(s, false)}
                        aria-label={`Done: ${s.title}. Mark not done`}
                        className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_4px_0_var(--primary-edge)] transition-transform duration-75 active:translate-y-1 active:shadow-none motion-reduce:transition-none"
                      >
                        <Check className="size-6" strokeWidth={3} aria-hidden />
                      </button>
                    ) : skipped ? (
                      <span aria-hidden className="flex size-12 items-center justify-center rounded-full border-[3px] border-dashed border-zinc-300 bg-card font-display text-lg font-black text-zinc-400">{i + 1}</span>
                    ) : isCurrent ? (
                      <span aria-hidden className="flex size-14 items-center justify-center rounded-full border-4 border-primary bg-card font-display text-xl font-black text-primary">{i + 1}</span>
                    ) : (
                      <span aria-hidden className="flex size-12 items-center justify-center rounded-full border-[3px] border-zinc-200 bg-zinc-100 font-display text-lg font-black text-zinc-500">{i + 1}</span>
                    )}
                  </div>
                  <div className={cn("flex min-w-0 flex-col gap-2", !isCurrent && "pt-2.5")}>
                    <button type="button" onClick={() => setEditing(editing === s.id ? null : s.id)} className="min-w-0 text-left" aria-expanded={editing === s.id}>
                      <span className={cn("block font-display leading-snug font-black", isCurrent ? "text-lg" : "text-[16px]", skipped && "text-muted-foreground line-through", !isDone && !isCurrent && !skipped && "text-zinc-700")}>
                        {s.title}
                      </span>
                      <span className="block text-[13px] text-muted-foreground">{detail(s)}</span>
                    </button>
                    {isCurrent && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <Button type="button" disabled={pending} onClick={() => toggle(s, true)}>Mark step done</Button>
                        {s.countKind && s.count === null && (
                          <button type="button" onClick={() => setEditing(s.id)} className="font-display text-[13px] font-extrabold text-sky hover:underline">
                            Record {COUNT_LABEL[s.countKind].toLowerCase()}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {editing === s.id && (
                  <ActionForm action={updateReviewStep.bind(null, s.id)} success="Step saved" reset={false} onDone={() => setEditing(null)} className="my-3 ml-[4.5rem] grid grid-cols-1 gap-3 rounded-xl border-2 bg-zinc-50 p-4 sm:grid-cols-2">
                    <input type="hidden" name="version" value={s.version} />
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`rs-t-${s.id}`}>Step</label>
                      <Input id={`rs-t-${s.id}`} name="title" defaultValue={s.title} required maxLength={200} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" htmlFor={`rs-s-${s.id}`}>Status</label>
                      <AppSelect id={`rs-s-${s.id}`} name="status" defaultValue={s.status} options={toOptions(reviewStepStatuses)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" htmlFor={`rs-d-${s.id}`}>Done on <span className="font-normal text-muted-foreground">(if done)</span></label>
                      <Input id={`rs-d-${s.id}`} type="date" name="doneOn" defaultValue={s.doneOn ?? ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" htmlFor={`rs-k-${s.id}`}>Records a PRISMA number</label>
                      <AppSelect id={`rs-k-${s.id}`} name="countKind" defaultValue={s.countKind ?? ""} options={toOptions(COUNT_LABEL, "No number")} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium" htmlFor={`rs-c-${s.id}`}>Number</label>
                      <Input id={`rs-c-${s.id}`} name="count" inputMode="numeric" pattern="[0-9]*" defaultValue={s.count ?? ""} placeholder="e.g. 412" />
                    </div>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-sm font-medium" htmlFor={`rs-n-${s.id}`}>Note</label>
                      <Textarea id={`rs-n-${s.id}`} name="note" rows={2} defaultValue={s.note ?? ""} placeholder="e.g. which databases, which version of the search" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                      <div className="flex gap-2">
                        <Button type="submit">Save</Button>
                        <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => start(async () => {
                          if (await trashWithUndo({ what: "Step", removed: true, trash: () => removeReviewStep(s.id), undo: () => undoRemove("review_step", s.id) })) setEditing(null);
                        })}
                      >
                        Remove step
                      </Button>
                    </div>
                  </ActionForm>
                )}
                {!last && <span aria-hidden className={cn("my-1 ml-[1.625rem] h-6 w-1.5 rounded-full", lineDone ? "bg-primary" : isDone ? "bg-leaf-bright/60" : "bg-zinc-200")} />}
              </li>
            );
          })}
        </ol>

        {adding && (
          <ActionForm action={addReviewStep.bind(null, manuscriptId)} success="Step added" onDone={() => setAdding(false)} className="mt-4 flex flex-wrap gap-2 border-t-2 border-zinc-100 pt-4">
            <label htmlFor="rs-new" className="sr-only">New step</label>
            <Input id="rs-new" name="title" required maxLength={200} placeholder="e.g. Second screener check" className="min-w-0 flex-[1_1_220px]" />
            <Button type="submit">Add</Button>
          </ActionForm>
        )}
      </section>

      <section aria-label="PRISMA numbers" className="flex min-w-0 flex-[2_1_300px] flex-col gap-4 rounded-2xl border-2 bg-card p-5 shadow-edge sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[20px]">PRISMA numbers</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(prismaText)}><Copy aria-hidden /> Copy</Button>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {(Object.keys(prismaCounts) as PrismaCount[]).map((k) => (
            <div key={k} className={cn("flex flex-col-reverse gap-0.5 rounded-2xl px-4 py-3", prisma[k] === null ? "border-2 border-dashed border-zinc-200" : "bg-background")}>
              <dt className="text-[12px] leading-snug text-muted-foreground">{prismaCounts[k]}</dt>
              <dd className={cn("font-display text-[24px] leading-tight font-black tabular-nums", prisma[k] === null && "text-zinc-400")}>
                {prisma[k] === null ? "—" : prisma[k]!.toLocaleString("en-IN")}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-[12px] text-muted-foreground">Blank stays blank: a number appears once it&apos;s recorded on a step. Records screened is identified minus duplicates, unless a step records it.</p>
      </section>
    </div>
  );
}

/**
 * The "step done" moment: full screen on a phone, a card on a computer. Says which step, where
 * the review now stands and what's next — never a nudge to hurry.
 */
function StepDone({ info, onClose, onNote }: { info: { step: ReviewStep; no: number; done: number; total: number; next: string | null } | null; onClose: () => void; onNote: (stepId: string) => void }) {
  return (
    <Dialog open={info !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col items-center gap-6 p-7 text-center sm:max-w-md max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:justify-center max-sm:rounded-none max-sm:px-6"
      >
        {info && (
          <>
            <CelebrationBurst size="lg" />
            <div className="flex flex-col gap-2">
              <p className="font-display text-[13px] font-extrabold tracking-[0.08em] text-leaf-strong uppercase">Step {info.no} done · {info.done} of {info.total}</p>
              <DialogTitle className="text-[28px] leading-tight font-black">{info.step.title}</DialogTitle>
              <DialogDescription className="text-[16px] text-muted-foreground">
                {info.done === info.total ? "Every step of this review is done." : "One more step behind you."}
              </DialogDescription>
            </div>
            {info.step.countKind && info.step.count !== null && (
              <div className="flex flex-col items-center rounded-2xl border-2 border-leaf-soft px-6 py-3">
                <span className="font-display text-[26px] font-black text-leaf-strong tabular-nums">{info.step.count.toLocaleString("en-IN")}</span>
                <span className="text-[13px] text-muted-foreground">{COUNT_LABEL[info.step.countKind]}</span>
              </div>
            )}
            <div className="grid w-full gap-1.5" style={{ gridTemplateColumns: `repeat(${info.total}, minmax(0, 1fr))` }} role="img" aria-label={`${info.done} of ${info.total} steps done`}>
              {Array.from({ length: info.total }, (_, i) => (
                <span key={i} className={cn("h-3.5 rounded-full", i < info.done ? "bg-primary" : "bg-zinc-200")} />
              ))}
            </div>
            {info.next && <p className="text-[14px] text-muted-foreground">Next up: {info.next}. No rush — it&apos;ll be here when you are.</p>}
            <div className="flex w-full flex-col gap-2">
              <Button type="button" size="lg" className="w-full" onClick={onClose} autoFocus>Continue</Button>
              <Button type="button" variant="link" onClick={() => onNote(info.step.id)}>Add a note about this step</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
