"use client";

import { useState, useTransition } from "react";
import { Copy, Plus } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { ActionForm } from "@/components/app/action-form";
import { copyToClipboard, quickAction, trashWithUndo } from "@/components/app/call-action";
import { celebrate } from "@/components/app/celebrate";
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

/** The review's steps: a bar of where it stands, the steps to tick off, and the PRISMA numbers. */
export function ReviewSteps({ projectId, steps, prisma }: { projectId: string; steps: ReviewStep[]; prisma: Record<PrismaCount, number | null> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  if (!steps.length) {
    return (
      <section id="progress" data-guide="review-steps" className="flex scroll-mt-6 flex-col items-start gap-3 rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
        <h2 className="text-[15px] font-extrabold">Review milestones</h2>
        <p className="text-sm text-muted-foreground">
          Track this review step by step — protocol, search, screening, eligibility, extraction, PRISMA diagram, draft and feedback — with the
          numbers a PRISMA flow diagram needs. You can rename, skip or add steps afterwards.
        </p>
        <Button type="button" disabled={pending} onClick={() => start(async () => { await quickAction(() => setUpReviewSteps(projectId)); })}>
          Set up the 11 review steps
        </Button>
      </section>
    );
  }

  const counted = steps.filter((s) => s.status !== "skipped");
  const done = counted.filter((s) => s.status === "done").length;
  const current = counted.find((s) => s.status === "in_progress") ?? counted.find((s) => s.status !== "done");
  const prismaText = (Object.keys(prismaCounts) as PrismaCount[]).map((k) => `${prismaCounts[k]}: ${prisma[k] ?? "not recorded"}`).join("\n");

  return (
    <div id="progress" data-guide="review-steps" className="flex scroll-mt-6 flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-extrabold">Review milestones</h2>
          <span className="text-[13px]">
            <span className="font-semibold">{done} of {counted.length} done</span>
            {current && <span className="text-muted-foreground"> · now: {current.title}</span>}
          </span>
        </div>
        <div role="img" aria-label={`${done} of ${counted.length} steps done${current ? `; now ${current.title}` : ""}`} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((s) => (
            <span key={s.id} title={s.title} className={cn("h-3 rounded-full", s.status === "done" ? "bg-primary" : s.status === "in_progress" ? "bg-leaf-bright/60" : s.status === "skipped" ? "bg-zinc-100 bg-[repeating-linear-gradient(135deg,transparent_0_3px,#d6d3cb_3px_4px)]" : "bg-zinc-200")} />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section className="min-w-0 flex-[3_1_380px] rounded-2xl border-2 bg-card shadow-edge">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h3 className="text-[15px] font-extrabold">Steps</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(!adding)}><Plus aria-hidden /> Add step</Button>
          </div>
          <ol className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
            {steps.map((s, i) => (
              <li key={s.id}>
                <div className="flex min-h-12 items-center gap-3 px-5 py-2.5">
                  <input
                    type="checkbox"
                    className="size-[18px] shrink-0 accent-primary"
                    aria-label={`Done: ${s.title}`}
                    checked={s.status === "done"}
                    disabled={pending || s.status === "skipped"}
                    onChange={(e) => { const next = e.target.checked; start(async () => { if ((await quickAction(() => toggleReviewStep(s.id, next))) && next) celebrate("Step done", s.title); }); }}
                  />
                  <button type="button" onClick={() => setEditing(editing === s.id ? null : s.id)} className="min-w-0 flex-1 text-left">
                    <span className={cn("block font-medium", s.status === "skipped" && "text-muted-foreground line-through")}>
                      <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>{s.title}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {[
                        s.status === "done" ? (s.doneOn ? `Done ${formatFullDay(s.doneOn)}` : "Done") : reviewStepStatuses[s.status],
                        s.countKind ? `${COUNT_LABEL[s.countKind].toLowerCase()}: ${s.count ?? "not recorded"}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  {s.status === "in_progress" && <Badge variant="info">In progress</Badge>}
                </div>
                {editing === s.id && (
                  <ActionForm action={updateReviewStep.bind(null, s.id)} success="Step saved" reset={false} onDone={() => setEditing(null)} className="mx-5 mb-4 grid grid-cols-1 gap-3 rounded-xl border-2 bg-zinc-50 p-4 sm:grid-cols-2">
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
              </li>
            ))}
          </ol>
          {adding && (
            <ActionForm action={addReviewStep.bind(null, projectId)} success="Step added" onDone={() => setAdding(false)} className="flex flex-wrap gap-2 border-t-2 border-zinc-100 px-5 py-3">
              <label htmlFor="rs-new" className="sr-only">New step</label>
              <Input id="rs-new" name="title" required maxLength={200} placeholder="e.g. Second screener check" className="min-w-0 flex-[1_1_220px]" />
              <Button type="submit">Add</Button>
            </ActionForm>
          )}
        </section>

        <section className="min-w-0 flex-[2_1_260px] rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[15px] font-extrabold">PRISMA numbers</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(prismaText)}><Copy aria-hidden /> Copy</Button>
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">From the numbers on the steps — ready for the flow diagram.</p>
          <dl className="mt-2 text-[13px]">
            {(Object.keys(prismaCounts) as PrismaCount[]).map((k) => (
              <div key={k} className="flex justify-between gap-3 border-t-2 border-zinc-100 py-2 first:border-t-0">
                <dt>{prismaCounts[k]}</dt>
                <dd className={cn("font-semibold tabular-nums", prisma[k] === null && "font-normal text-muted-foreground")}>
                  {prisma[k] ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] text-muted-foreground">Records screened is identified minus duplicates, unless a step records it.</p>
        </section>
      </div>
    </div>
  );
}
