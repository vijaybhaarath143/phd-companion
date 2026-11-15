"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions } from "@/lib/options";
import { ActionForm } from "@/components/app/action-form";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { Breadcrumb } from "@/components/app/ui";
import { addSubmission, recordDecision, recordFeedback, recordPhase, reopenFeedback, resolveFeedback, setArticleType } from "@/server/actions/research";
import { Segmented } from "@/components/app/segmented";
import { formatFullDay, formatPartialDate, type Precision } from "@/lib/dates";
import { quickAction } from "@/components/app/call-action";
import { phases, submissionStatuses, type Phase, viaLabel } from "@/lib/labels";

type Props = {
  manuscript: { id: string; title: string; currentPhase: Phase; stoppedReason: string | null; articleType: string | null };
  history: { id: string; phase: Phase; effectiveDate: string | null; effectivePrecision: Precision; recordedAt: Date; recordedLabel: string; kind: string; note: string | null; createdVia: string }[];
  submissions: { id: string; attemptNo: number; journalName: string; manuscriptRef: string | null; submittedDate: string | null; submittedPrecision: Precision; status: string; decisionDate: string | null; closedAt: Date | null; version: number }[];
  submissionHistory: { id: string; submissionId: string; status: string; decisionDate: string | null; recordedLabel: string; createdVia: string }[];
  feedback: { entryId: string; title: string; source: string | null; requestedChanges: string | null; resolutionStatus: string; entryDate: string | null; entryPrecision: Precision; taskCount: number }[];
  waitingTasks: { id: string; title: string; waitingReason: string | null }[];
  today: string;
  /** Review steps and the like, shown under the title. */
  children?: ReactNode;
};

type Panel = null | "change" | "earlier" | "submission" | "feedback";

function PhaseSelect({ name = "phase", defaultValue }: { name?: string; defaultValue?: string }) {
  return (
    <AppSelect name={name} defaultValue={defaultValue} required aria-label="Phase" options={Object.entries(phases).map(([value, label], i) => ({ value, label: `${i + 1}. ${label}` }))} />
  );
}

/** A submission's recorded changes, oldest first: status, decision date, and when each was recorded. */
function SubmissionHistory({ events }: { events: Props["submissionHistory"] }) {
  if (!events.length) return null;
  return (
    <details className="ml-8 text-[13px]">
      <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
        History · {events.length} {events.length === 1 ? "record" : "records"}
      </summary>
      <ol className="mt-2 flex flex-col gap-1 border-l border-zinc-200 pl-3">
        {events.map((e) => (
          <li key={e.id}>
            <span className="font-medium">{submissionStatuses[e.status as keyof typeof submissionStatuses] ?? e.status}</span>
            <span className="text-muted-foreground">
              {e.decisionDate ? ` · decision ${formatFullDay(e.decisionDate)}` : ""} · recorded {e.recordedLabel}
              {viaLabel(e.createdVia) ? ` · via ${viaLabel(e.createdVia)}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function ManuscriptView({ manuscript, history, submissions, submissionHistory, feedback, waitingTasks, today, children }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const close = () => setPanel(null);
  const openFeedback = feedback.filter((f) => f.resolutionStatus === "open");
  const currentEventId = [...history].filter((h) => h.kind === "change").sort((a, b) => +new Date(b.recordedAt) - +new Date(a.recordedAt))[0]?.id;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <Breadcrumb items={[{ href: "/research", label: "Publications" }, { label: manuscript.articleType === "review" ? "Review" : "Publication" }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-tight font-black md:text-[34px]">{manuscript.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Article type</span>
          <Segmented
            name="articleType"
            label="Article type"
            size="sm"
            value={manuscript.articleType === "review" ? "review" : "original"}
            onChange={(v) => start(async () => { await quickAction(() => setArticleType(manuscript.id, v)); })}
            options={[{ value: "review", label: "Review article" }, { value: "original", label: "Original article" }]}
          />
        </div>
      </div>

      {children}

      <section className="flex flex-col gap-4 rounded-2xl border-2 bg-card shadow-edge p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[13px] text-muted-foreground">Current phase</p>
            <p className="text-xl font-semibold tracking-[-0.01em]">
              {phases[manuscript.currentPhase]}
              {manuscript.currentPhase === "stopped" && manuscript.stoppedReason && <span className="font-normal text-muted-foreground"> · {manuscript.stoppedReason}</span>}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Recording an earlier change adds it to the history without moving the current phase.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPanel(panel === "earlier" ? null : "earlier")}>Record an earlier change</Button>
            <Button onClick={() => setPanel(panel === "change" ? null : "change")}>Change current phase</Button>
          </div>
        </div>
        {(panel === "change" || panel === "earlier") && (
          <ActionForm
            key={panel}
            action={recordPhase.bind(null, manuscript.id, panel === "change" ? "change" : "earlier_change")}
            success={panel === "change" ? "Phase changed" : "Added to history"}
            onDone={close}
            className="flex flex-col gap-4 rounded-xl border-2 bg-zinc-50 p-4"
          >
            <p className="font-medium">{panel === "change" ? "Move the manuscript to a new phase" : "Add a past phase change to the history"}</p>
            <div className="flex max-w-96 flex-col gap-1.5">
              <span className="text-sm font-medium">Phase</span>
              <PhaseSelect defaultValue={panel === "change" ? manuscript.currentPhase : undefined} />
            </div>
            <PartialDateInput name="when" label="When did it happen?" today={today} allowNone={panel === "change"} noneLabel="Not sure" />
            <div className="flex max-w-xl flex-col gap-1.5">
              <label htmlFor="ph-note" className="text-sm font-medium">Note <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="ph-note" name="note" />
            </div>
            {panel === "change" && (
              <div className="flex max-w-96 flex-col gap-1.5">
                <label htmlFor="ph-stop" className="text-sm font-medium">If stopped: why?</label>
                <AppSelect id="ph-stop" name="stoppedReason" defaultValue="" options={toOptions({ withdrawn: "Withdrawn", abandoned: "Abandoned" }, "—")} />
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
            </div>
          </ActionForm>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
          <section className="rounded-2xl border-2 bg-card shadow-edge">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-extrabold">Guide feedback</h2>
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "feedback" ? null : "feedback")}>Record feedback</Button>
            </div>
            {panel === "feedback" && (
              <ActionForm action={recordFeedback.bind(null, manuscript.id)} success="Feedback recorded" onDone={close} className="mx-5 mb-4 flex flex-col gap-4 rounded-xl border-2 bg-zinc-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fb-src" className="text-sm font-medium">From</label>
                    <Input id="fb-src" name="source" placeholder="e.g. your guide" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="fb-via" className="text-sm font-medium">How you received it</label>
                    <Input id="fb-via" name="via" placeholder="e.g. meeting, email, comments on draft" />
                  </div>
                </div>
                <PartialDateInput name="received" label="When did you receive it?" today={today} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="fb-changes" className="text-sm font-medium">Requested changes</label>
                  <p className="-mt-1 text-[13px] text-muted-foreground">One per line.</p>
                  <Textarea id="fb-changes" name="changes" rows={5} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="makeTasks" defaultChecked className="size-4 accent-primary" />
                  Turn each requested change into a task (linked back to this feedback)
                </label>
                <div className="flex gap-2">
                  <Button type="submit">Save feedback</Button>
                  <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
                </div>
              </ActionForm>
            )}
            {feedback.length === 0 && waitingTasks.length === 0 && (
              <p className="px-5 pb-5 text-sm text-muted-foreground">No feedback recorded yet. When it arrives, add the requested changes — each can become a task that links back here.</p>
            )}
            {(feedback.length > 0 || waitingTasks.length > 0) && (
              <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
                {waitingTasks.map((t) => (
                  <li key={t.id} className="flex min-h-14 items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.title}</span>
                      <span className="block text-[13px] text-muted-foreground">{t.waitingReason ?? "Waiting"}</span>
                    </span>
                    <Badge variant="attention">Pending</Badge>
                  </li>
                ))}
                {feedback.map((f) => (
                  <li key={f.entryId} className="flex flex-col gap-2 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/journal/${f.entryId}`} className="min-w-0 flex-1">
                        <span className="block font-medium hover:underline">{f.source ? `From ${f.source}` : f.title}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {formatPartialDate(f.entryDate, f.entryPrecision)}{f.taskCount ? ` · ${f.taskCount} task${f.taskCount > 1 ? "s" : ""}` : ""}
                        </span>
                      </Link>
                      {f.resolutionStatus === "open" ? (
                        <>
                          <Badge variant="attention">Open</Badge>
                          <Button size="sm" variant="outline" onClick={() => setResolving(resolving === f.entryId ? null : f.entryId)}>Mark resolved</Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="muted">Resolved</Badge>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => void (await quickAction(() => reopenFeedback(f.entryId))))}>Reopen</Button>
                        </>
                      )}
                    </div>
                    {f.requestedChanges && <p className="text-[13px] whitespace-pre-line text-zinc-700">{f.requestedChanges}</p>}
                    {resolving === f.entryId && (
                      <ActionForm action={resolveFeedback.bind(null, f.entryId)} success="Marked resolved" onDone={() => setResolving(null)} className="flex flex-wrap gap-2">
                        <Input name="note" placeholder="How it was resolved (optional)" aria-label="Resolution note" className="min-w-0 flex-[1_1_240px]" />
                        <Button type="submit">Resolve</Button>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {openFeedback.length > 0 && <p className="border-t-2 border-zinc-100 px-5 py-3 text-[13px] text-muted-foreground">Feedback stays open until you mark it resolved — finishing its tasks doesn&apos;t close it.</p>}
          </section>

          <section className="rounded-2xl border-2 bg-card shadow-edge">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-extrabold">Journal submissions</h2>
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "submission" ? null : "submission")}>Record a submission</Button>
            </div>
            {panel === "submission" && (
              <ActionForm action={addSubmission.bind(null, manuscript.id)} success="Submission recorded" celebrate={{ title: "Submission recorded", detail: manuscript.title }} onDone={close} className="mx-5 mb-4 flex flex-col gap-4 rounded-xl border-2 bg-zinc-50 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="sub-j" className="text-sm font-medium">Journal</label>
                    <Input id="sub-j" name="journal" required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="sub-ref" className="text-sm font-medium">Manuscript ID <span className="font-normal text-muted-foreground">(optional)</span></label>
                    <Input id="sub-ref" name="ref" />
                  </div>
                </div>
                <div className="flex max-w-72 flex-col gap-1.5">
                  <label htmlFor="sub-status" className="text-sm font-medium">Status</label>
                  <AppSelect id="sub-status" name="status" defaultValue="submitted" options={toOptions({ planned: "Planned — not sent yet", submitted: "Submitted", under_review: "Under review" })} />
                </div>
                <PartialDateInput name="submitted" label="Submitted on" today={today} noneLabel="Not sent yet" />
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
                </div>
              </ActionForm>
            )}
            {submissions.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">No submissions yet. Each journal you submit to gets its own record, so a rejection never erases the history.</p>
            ) : (
              <ol className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
                {submissions.map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-[13px] text-muted-foreground">{s.attemptNo}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.journalName}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {s.submittedPrecision === "none" ? "Not sent yet" : `Submitted ${formatPartialDate(s.submittedDate, s.submittedPrecision)}`}
                          {s.manuscriptRef ? ` · ID ${s.manuscriptRef}` : ""}
                          {s.decisionDate ? ` · decision ${formatFullDay(s.decisionDate)}` : ""}
                        </span>
                      </span>
                      <Badge variant={s.closedAt ? "muted" : "outline"}>{submissionStatuses[s.status as keyof typeof submissionStatuses]}{s.closedAt ? " · closed" : ""}</Badge>
                      {!s.closedAt && <Button size="sm" variant="outline" onClick={() => setDeciding(deciding === s.id ? null : s.id)}>Update</Button>}
                    </div>
                    {deciding === s.id && (
                      <ActionForm action={recordDecision.bind(null, s.id)} success="Saved" reset={false} onDone={() => setDeciding(null)} className="ml-8 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="version" value={s.version} />
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium" htmlFor={`dec-${s.id}`}>Journal&apos;s decision</label>
                          <AppSelect id={`dec-${s.id}`} name="status" defaultValue={s.status} className="w-56" options={toOptions({ submitted: "Submitted", under_review: "Under review", revise: "Revise and resubmit (same journal)", accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn" })} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium" htmlFor={`dd-${s.id}`}>Decision date</label>
                          <Input id={`dd-${s.id}`} type="date" name="decisionDate" defaultValue={s.decisionDate ?? ""} className="w-44" />
                        </div>
                        <Button type="submit">Save</Button>
                        {s.decisionDate && (
                          <label className="flex basis-full items-center gap-2 text-[13px] text-muted-foreground">
                            <input type="checkbox" name="clearDecisionDate" className="size-4 accent-primary" />
                            Clear the decision date (leaving the date empty keeps it)
                          </label>
                        )}
                      </ActionForm>
                    )}
                    <SubmissionHistory events={submissionHistory.filter((e) => e.submissionId === s.id)} />
                  </li>
                ))}
              </ol>
            )}
            {submissions.length > 0 && <p className="border-t-2 border-zinc-100 px-5 py-3 text-[13px] text-muted-foreground">Revision rounds with the same journal stay inside that submission. After a rejection, record a new submission for the next journal.</p>}
          </section>
        </div>

        <section className="min-w-0 flex-[2_1_280px] rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
          <h2 className="mb-1 text-[15px] font-extrabold">Phase history</h2>
          <ol>
            {history.map((h) => (
              <li key={h.id} className="flex gap-3 py-2.5">
                <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${h.id === currentEventId ? "bg-primary" : "bg-zinc-300"}`} />
                <span>
                  <span className="block font-medium">{phases[h.phase]}{h.id === currentEventId && <span className="font-normal text-muted-foreground"> · current</span>}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {h.effectivePrecision === "none" ? "Date not known" : formatPartialDate(h.effectiveDate, h.effectivePrecision)}
                    {h.kind === "earlier_change" ? " · added later" : ""}
                    {viaLabel(h.createdVia) ? ` · via ${viaLabel(h.createdVia)}` : ""}
                    {" · recorded "}{h.recordedLabel}
                  </span>
                  {h.note && <span className="block text-[13px] text-zinc-700">{h.note}</span>}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[13px] text-muted-foreground">Every change keeps the date it happened and the date you recorded it. Nothing here is ever erased.</p>
        </section>
      </div>
    </div>
  );
}
