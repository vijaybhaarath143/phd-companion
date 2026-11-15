"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions } from "@/lib/options";
import { ActionForm } from "@/components/app/action-form";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { addCourse, addCourseItem, addEnquiry, addMilestone, recordRecognition, removeCourseItem, saveAdminDetails, saveRequirement, toggleCourseItem, trashCourse, updateCourse, updateEnquiry, updateMilestone } from "@/server/actions/academics";
import { trashWithUndo } from "@/components/app/call-action";
import { QuickCheckbox } from "@/components/app/quick-checkbox";
import type { CourseItem } from "@/server/academics";
import { undoRemove, undoTrash } from "@/server/actions/settings";
import { formatCredits } from "@/lib/credits";
import { formatFullDay, formatPartialDate, type Precision } from "@/lib/dates";
import { courseStatuses, enquiryStatuses, milestoneStatuses, suggestedMilestones } from "@/lib/labels";

export function RequirementEditor({ requirement }: { requirement: { label: string; periodLabel: string | null; requiredCredits: number | null; version: number } | null }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{requirement ? "Edit requirement" : "Set requirement"}</Button>;
  return (
    <ActionForm action={saveRequirement} success="Saved" reset={false} onDone={() => setOpen(false)} className="flex w-full flex-wrap items-end gap-3 rounded-xl border-2 bg-zinc-50 p-4">
      {requirement && <input type="hidden" name="version" value={requirement.version} />}
      <div className="flex flex-col gap-1.5"><label htmlFor="rq-l" className="text-sm font-medium">Name</label><Input id="rq-l" name="label" defaultValue={requirement?.label ?? "Coursework credits"} className="w-56" /></div>
      <div className="flex flex-col gap-1.5"><label htmlFor="rq-p" className="text-sm font-medium">Period</label><Input id="rq-p" name="period" defaultValue={requirement?.periodLabel ?? ""} placeholder="e.g. First year" className="w-40" /></div>
      <div className="flex flex-col gap-1.5"><label htmlFor="rq-c" className="text-sm font-medium">Credits required</label><Input id="rq-c" name="credits" inputMode="decimal" defaultValue={requirement?.requiredCredits ?? ""} className="w-32" /></div>
      <Button type="submit">Save</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </ActionForm>
  );
}

type Course = { id: string; name: string; provider: string | null; credits: number | null; status: string; completedOn: string | null; recognised: number; version: number };

export function CoursesSection({ courses, items, today }: { courses: Course[]; items: CourseItem[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const [deadlines, setDeadlines] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [recognising, setRecognising] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section id="courses" data-guide="courses" className="scroll-mt-6 rounded-2xl border-2 bg-card shadow-edge">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[22px]">Courses <span className="font-display text-[15px] font-bold text-muted-foreground">· {courses.length}</span></h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}><Plus className="size-3.5" aria-hidden /> Add course</Button>
      </div>
      {adding && (
        <ActionForm action={addCourse} success="Course added" onDone={() => setAdding(false)} className="mx-5 mb-4 flex flex-wrap items-end gap-3 rounded-xl border-2 bg-zinc-50 p-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="c-n" className="text-sm font-medium">Course</label><Input id="c-n" name="name" required className="w-60" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="c-p" className="text-sm font-medium">Provider</label><Input id="c-p" name="provider" className="w-44" placeholder="e.g. SWAYAM" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="c-c" className="text-sm font-medium">Credits <span className="font-normal text-muted-foreground">(leave blank if unknown)</span></label><Input id="c-c" name="credits" inputMode="decimal" className="w-32" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="c-s" className="text-sm font-medium">Status</label>
            <AppSelect id="c-s" name="status" defaultValue="enrolled" className="w-40" options={toOptions(courseStatuses)} /></div>
          <Button type="submit">Add</Button>
        </ActionForm>
      )}
      {courses.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No courses yet.</p>
      ) : (
        <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
          {courses.map((c) => {
            const mine = items.filter((it) => it.courseId === c.id);
            const open = mine.filter((it) => !it.doneAt).length;
            return (
              <li key={c.id} className="flex flex-col">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-4">
                  <span className="min-w-0 flex-[1_1_220px]">
                    <span className="block font-display text-[16px] leading-snug font-extrabold">{c.name}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {[
                        c.provider,
                        c.recognised > 0 ? `${formatCredits(c.recognised)} officially recognised` : null,
                        c.status === "completed" && c.credits !== null && c.recognised < c.credits ? `${formatCredits(c.credits - c.recognised)} not yet recognised` : null,
                      ].filter(Boolean).join(" · ") || " "}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {c.credits === null ? (
                      <Badge variant="outline" className="border-2 border-dashed">Credits unknown</Badge>
                    ) : (
                      <Badge variant="grape">{formatCredits(c.credits)} {c.credits === 1 ? "credit" : "credits"}</Badge>
                    )}
                    <Badge variant={c.status === "completed" ? "info" : c.status === "enrolled" ? "grape" : c.status === "dropped" ? "muted" : "outline"}>{courseStatuses[c.status as keyof typeof courseStatuses]}</Badge>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" aria-expanded={deadlines === c.id} onClick={() => setDeadlines(deadlines === c.id ? null : c.id)}>
                      Deadlines{open ? ` · ${open}` : ""}
                    </Button>
                    {c.status === "completed" && <Button size="sm" variant="outline" onClick={() => setRecognising(recognising === c.id ? null : c.id)}>Record recognition</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(editing === c.id ? null : c.id)}>Edit</Button>
                  </span>
                </div>
                {editing === c.id && (
                  <div className="px-5 pb-4">
                    <ActionForm action={updateCourse.bind(null, c.id)} success="Course saved" reset={false} onDone={() => setEditing(null)} className="flex flex-wrap items-end gap-3 rounded-xl border-2 bg-zinc-50 p-4">
                          <input type="hidden" name="version" value={c.version} />
                          <div className="flex flex-col gap-1.5"><label htmlFor={`cn-${c.id}`} className="text-sm font-medium">Course</label>
                            <Input id={`cn-${c.id}`} name="name" required maxLength={300} defaultValue={c.name} className="w-60" /></div>
                          <div className="flex flex-col gap-1.5"><label htmlFor={`cp-${c.id}`} className="text-sm font-medium">Provider</label>
                            <Input id={`cp-${c.id}`} name="provider" maxLength={200} defaultValue={c.provider ?? ""} className="w-44" /></div>
                          <div className="flex flex-col gap-1.5"><label htmlFor={`cs-${c.id}`} className="text-sm font-medium">Status</label>
                            <AppSelect id={`cs-${c.id}`} name="status" defaultValue={c.status} className="w-40" options={toOptions(courseStatuses)} /></div>
                          <div className="flex flex-col gap-1.5"><label htmlFor={`cc-${c.id}`} className="text-sm font-medium">Credits <span className="font-normal text-muted-foreground">(blank = unknown)</span></label>
                            <Input id={`cc-${c.id}`} name="credits" inputMode="decimal" defaultValue={c.credits ?? ""} className="w-32" /></div>
                          <Button type="submit">Save</Button>
                          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                          <Button type="button" variant="ghost" className="ml-auto" disabled={pending}
                            onClick={() => start(async () => { await trashWithUndo({ what: "Course", note: "Its credits no longer count in your totals.", trash: () => trashCourse(c.id), undo: () => undoTrash("courses", c.id) }); })}>
                            Move to Trash
                          </Button>
                          <p className="w-full text-[13px] text-muted-foreground">Marking a course completed doesn&apos;t record any official recognition — that&apos;s a separate step.</p>
                        </ActionForm>
                  </div>
                )}
                {recognising === c.id && (
                  <div className="px-5 pb-4">
                    <ActionForm action={recordRecognition.bind(null, c.id)} success="Recognition recorded" celebrate={{ title: "Credits recognised", detail: c.name }} onDone={() => setRecognising(null)} className="flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1.5"><label htmlFor={`ra-${c.id}`} className="text-sm font-medium">Credits recognised</label>
                              <Input id={`ra-${c.id}`} name="amount" inputMode="decimal" required className="w-32" /></div>
                            <div className="flex flex-col gap-1.5"><label htmlFor={`rr-${c.id}`} className="text-sm font-medium">Reference <span className="font-normal text-muted-foreground">(optional)</span></label>
                              <Input id={`rr-${c.id}`} name="reference" placeholder="e.g. office letter number" className="w-60" /></div>
                          </div>
                          <PartialDateInput name="recognised" label="Recognised on" today={today} />
                          <Button type="submit" className="self-start">Save</Button>
                        </ActionForm>
                  </div>
                )}
                {deadlines === c.id && (
                  <div className="flex flex-col gap-2 border-t-2 border-zinc-100 bg-zinc-50/60 px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-extrabold">Deadlines</h3>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDeadlines(null)}>Close</Button>
                    </div>
                    <CourseDeadlines courseId={c.id} items={mine} today={today} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t-2 border-zinc-100 px-5 py-3 text-[13px] text-muted-foreground">Course status: Planned → Enrolled → Completed (or Dropped). After completion, use “Record recognition” — it can be partial.</p>
    </section>
  );
}

type Milestone = { id: string; title: string; status: string; targetDate: string | null; targetPrecision: Precision; doneOn: string | null; donePrecision: Precision; version: number };

/** The milestone's "Update": starts from what's recorded (done date, target), never from today. */
function MilestoneForm({ m, today, onDone }: { m: Milestone; today: string; onDone: () => void }) {
  const [status, setStatus] = useState(m.status);
  return (
    <ActionForm action={updateMilestone.bind(null, m.id)} success="Saved" celebrate={status === "done" && m.status !== "done" ? { title: "Milestone done", detail: m.title } : undefined} reset={false} onDone={onDone} className="flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4">
      <input type="hidden" name="version" value={m.version} />
      <div className="flex flex-col gap-1.5"><label htmlFor={`mt-${m.id}`} className="text-sm font-medium">Milestone</label>
        <Input id={`mt-${m.id}`} name="title" required maxLength={300} defaultValue={m.title} /></div>
      <PartialDateInput name="target" label="Target date" today={today} noneLabel="No date yet" defaultValue={{ date: m.targetDate, precision: m.targetPrecision }} />
      <div className="flex max-w-60 flex-col gap-1.5"><label htmlFor={`ms-${m.id}`} className="text-sm font-medium">Status</label>
        <AppSelect id={`ms-${m.id}`} name="status" value={status} onValueChange={setStatus} options={toOptions(milestoneStatuses)} /></div>
      {status === "done" && (
        <PartialDateInput
          name="done"
          label="When was it done?"
          today={today}
          noneLabel="Not sure"
          defaultValue={m.status === "done" ? { date: m.doneOn, precision: m.donePrecision } : undefined}
        />
      )}
      <Button type="submit" className="self-start">Save</Button>
    </ActionForm>
  );
}

export function MilestonesSection({ milestones, today }: { milestones: Milestone[]; today: string }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const existing = new Set(milestones.map((m) => m.title.toLowerCase()));
  return (
    <section id="milestones" data-guide="milestones" className="min-w-0 scroll-mt-6 flex-[3_1_420px] rounded-2xl border-2 bg-card shadow-edge">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[22px]">Milestones</h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(adding === null ? "" : null)}>Add milestone</Button>
      </div>
      {adding !== null && (
        <ActionForm key={adding} action={addMilestone} success="Milestone added" onDone={() => setAdding(null)} className="mx-5 mb-4 flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="m-t" className="text-sm font-medium">Milestone</label><Input id="m-t" name="title" required defaultValue={adding} /></div>
          <PartialDateInput name="target" label="Target date" today={today} noneLabel="No date yet" defaultValue={{ date: null, precision: "none" }} />
          <Button type="submit" className="self-start">Add</Button>
        </ActionForm>
      )}
      {milestones.length > 0 && (
        <ol className="flex flex-col px-5 pb-2">
          {milestones.map((m, i) => {
            const done = m.status === "done";
            const skipped = m.status === "skipped";
            const last = i === milestones.length - 1;
            return (
              <li key={m.id} className="flex gap-4">
                <div aria-hidden className="flex flex-col items-center pt-0.5">
                  {done ? (
                    <span className="flex size-8 items-center justify-center rounded-full bg-grape text-white shadow-[0_3px_0_var(--grape-strong)]"><Check className="size-4" strokeWidth={3.4} /></span>
                  ) : skipped ? (
                    <span className="size-8 rounded-full border-[3px] border-dashed border-zinc-300 bg-card" />
                  ) : m.targetPrecision !== "none" ? (
                    <span className="size-8 rounded-full border-[3px] border-grape bg-card" />
                  ) : (
                    <span className="size-8 rounded-full border-[3px] border-zinc-200 bg-zinc-100" />
                  )}
                  {!last && <span className={done ? "my-1 w-1 flex-1 rounded-full bg-grape-light" : "my-1 w-1 flex-1 rounded-full bg-zinc-200"} />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 pb-5">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-[1_1_180px]">
                      <span className={skipped ? "block font-display text-[15px] font-extrabold text-muted-foreground line-through" : "block font-display text-[15px] font-extrabold"}>{m.title}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {done
                          ? m.donePrecision === "none" ? "Done · date not recorded" : `Done ${formatPartialDate(m.doneOn, m.donePrecision)}`
                          : m.targetPrecision === "none" ? "No date yet" : formatPartialDate(m.targetDate, m.targetPrecision)}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setMarking(marking === m.id ? null : m.id)}>Update</Button>
                  </div>
                  {marking === m.id && <MilestoneForm m={m} today={today} onDone={() => setMarking(null)} />}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-col gap-2.5 border-t-2 border-zinc-100 px-5 py-4">
        <p className="text-[13px] text-muted-foreground">Suggestions only — add the ones your university uses, with your own dates.</p>
        <div className="flex flex-wrap gap-2">
          {suggestedMilestones.filter((s) => !existing.has(s.toLowerCase())).map((s) => (
            <button key={s} type="button" onClick={() => setAdding(s)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-zinc-300 px-3 text-[13px] font-medium text-zinc-700 hover:bg-muted">
              <Plus className="size-3.5" aria-hidden /> {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

type Enquiry = { entryId: string; title: string; office: string | null; contact: string | null; response: string | null; followUpDate: string | null; status: string; entryVersion: number };

export function EnquiriesSection({ enquiries, today }: { enquiries: Enquiry[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section id="enquiries" data-guide="enquiries" className="min-w-0 flex-[2_1_300px] scroll-mt-6 rounded-2xl border-2 bg-card shadow-edge">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[22px]">Office enquiries</h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>Add enquiry</Button>
      </div>
      {adding && (
        <ActionForm action={addEnquiry} success="Enquiry added" onDone={() => setAdding(false)} className="mx-5 mb-4 flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="q-t" className="text-sm font-medium">What you asked</label><Input id="q-t" name="title" required /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="q-o" className="text-sm font-medium">Office</label><Input id="q-o" name="office" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="q-c" className="text-sm font-medium">Contact person <span className="font-normal text-muted-foreground">(optional)</span></label><Input id="q-c" name="contact" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="q-f" className="text-sm font-medium">Follow up on</label><Input id="q-f" type="date" name="followUp" className="w-44" /></div>
          <Button type="submit" className="self-start">Add</Button>
        </ActionForm>
      )}
      {enquiries.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground">Nothing open. Track a question to an office — who you asked, their reply, and when to follow up. It stays open until you close it.</p>
      ) : (
        <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
          {enquiries.map((q) => {
            const due = q.followUpDate && q.followUpDate <= today && q.status !== "closed";
            return (
              <li key={q.entryId} className="flex flex-col gap-2 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <Link href={`/journal/${q.entryId}`} className="block font-medium hover:underline">{q.title}</Link>
                    <span className="block text-[13px] text-muted-foreground">
                      {[q.office, q.followUpDate && q.status !== "closed" ? `follow up ${formatFullDay(q.followUpDate)}` : null].filter(Boolean).join(" · ") || " "}
                    </span>
                  </span>
                  <Badge variant={due ? "attention" : q.status === "closed" ? "muted" : "outline"}>{due ? "Follow up" : enquiryStatuses[q.status as keyof typeof enquiryStatuses]}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(editing === q.entryId ? null : q.entryId)}>Update</Button>
                </div>
                {editing === q.entryId && (
                  <ActionForm action={updateEnquiry.bind(null, q.entryId)} success="Saved" reset={false} onDone={() => setEditing(null)} className="flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4">
                    <input type="hidden" name="version" value={q.entryVersion} />
                    <div className="flex flex-col gap-1.5"><label htmlFor={`qr-${q.entryId}`} className="text-sm font-medium">Response</label><Textarea id={`qr-${q.entryId}`} name="response" rows={2} defaultValue={q.response ?? ""} /></div>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex flex-col gap-1.5"><label htmlFor={`qf-${q.entryId}`} className="text-sm font-medium">Follow up on</label><Input id={`qf-${q.entryId}`} type="date" name="followUp" defaultValue={q.followUpDate ?? ""} className="w-44" /></div>
                      <div className="flex flex-col gap-1.5"><label htmlFor={`qs-${q.entryId}`} className="text-sm font-medium">Status</label>
                        <AppSelect id={`qs-${q.entryId}`} name="status" defaultValue={q.status} className="w-48" options={toOptions(enquiryStatuses)} /></div>
                    </div>
                    <Button type="submit" className="self-start">Save</Button>
                  </ActionForm>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- course deadlines

const ITEM_KIND_LABELS = { assignment: "Assignment", exam_registration: "Exam registration", exam: "Exam" } as const;

/** A course's assignments, exam registration and exam: tick off when done; dated ones show in Reminders. */
function CourseDeadlines({ courseId, items, today }: { courseId: string; items: CourseItem[]; today: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4 whitespace-normal">
      {items.length ? (
        <ul className="flex flex-col divide-y divide-zinc-200/70">
          {items.map((it) => {
            const done = Boolean(it.doneAt);
            const late = !done && it.dueDate !== null && it.dueDate < today;
            return (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <QuickCheckbox checked={done} label={`Done: ${it.title}`} disabled={pending} onToggle={(next) => toggleCourseItem(it.id, next)} />
                <span className="min-w-0 flex-1">
                  <span className={`block font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{it.title}</span>
                  <span className={`block text-[13px] ${late ? "text-overdue-foreground" : "text-muted-foreground"}`}>
                    {ITEM_KIND_LABELS[it.kind]} · {it.dueDate ? `${late ? "was due" : "due"} ${formatFullDay(it.dueDate)}` : "no date"}
                  </span>
                </span>
                {late && <Badge variant="overdue">Overdue</Badge>}
                <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Remove ${it.title}`}
                  onClick={() => start(async () => { await trashWithUndo({ what: it.title, removed: true, trash: () => removeCourseItem(it.id), undo: () => undoRemove("course_item", it.id) }); })}>
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">No deadlines yet. Add assignment due dates, the exam registration deadline and the exam date — they show up in Reminders and on the calendar.</p>
      )}
      <ActionForm action={addCourseItem.bind(null, courseId)} success="Deadline added" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5"><label htmlFor={`ci-k-${courseId}`} className="text-sm font-medium">Kind</label>
          <AppSelect id={`ci-k-${courseId}`} name="kind" defaultValue="assignment" className="w-48" options={toOptions(ITEM_KIND_LABELS)} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor={`ci-t-${courseId}`} className="text-sm font-medium">Name</label>
          <Input id={`ci-t-${courseId}`} name="title" maxLength={200} placeholder="e.g. Week 3 assignment" className="w-56" /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor={`ci-d-${courseId}`} className="text-sm font-medium">Due</label>
          <Input id={`ci-d-${courseId}`} name="dueDate" type="date" className="w-44" /></div>
        <Button type="submit" variant="outline">Add</Button>
      </ActionForm>
    </div>
  );
}

// ---------------------------------------------------------------- admin key details

/** Details she keeps looking up — enrolment number, office contacts — as label / value pairs. */
export function AdminDetailsSection({ details }: { details: { label: string; value: string }[] }) {
  type Row = { id: string; label: string; value: string };
  const withIds = (list: { label: string; value: string }[]): Row[] => list.map((d) => ({ id: crypto.randomUUID(), ...d }));
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  // every Edit starts from what is saved now (never from an earlier, stale copy)
  const startEditing = () => {
    setRows(withIds(details.length ? details : [{ label: "Enrolment number", value: "" }, { label: "Research office contact", value: "" }]));
    setEditing(true);
  };
  const change = (id: string, field: "label" | "value", v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  return (
    <section id="admin" data-guide="admin-info" className="flex min-w-0 flex-[3_1_380px] scroll-mt-6 flex-col gap-3 rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px]">Admin info</h2>
          <p className="text-[13px] text-muted-foreground">Details you keep looking up. Only you can see them.</p>
        </div>
        {!editing && <Button size="sm" variant="outline" onClick={startEditing}>{details.length ? "Edit" : "Add details"}</Button>}
      </div>
      {editing ? (
        <ActionForm action={saveAdminDetails} success="Saved" reset={false} onDone={() => setEditing(false)} className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2">
              <label className="sr-only" htmlFor={`ad-l-${r.id}`}>Detail {i + 1}: label</label>
              <Input id={`ad-l-${r.id}`} name="label" value={r.label} onChange={(e) => change(r.id, "label", e.target.value)} maxLength={120} placeholder="e.g. Enrolment number" />
              <label className="sr-only" htmlFor={`ad-v-${r.id}`}>Detail {i + 1}: value</label>
              <Input id={`ad-v-${r.id}`} name="value" value={r.value} onChange={(e) => change(r.id, "value", e.target.value)} maxLength={500} />
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${r.label || `detail ${i + 1}`}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}>Remove</Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { id: crypto.randomUUID(), label: "", value: "" }])}><Plus className="size-3.5" aria-hidden /> Add a detail</Button>
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </ActionForm>
      ) : details.length ? (
        <dl className="text-[13px]">
          {details.map((d, i) => (
            <div key={i} className="flex justify-between gap-4 border-t-2 border-zinc-100 py-2.5 first:border-t-0">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="text-right font-medium break-words">{d.value || <span className="font-normal text-muted-foreground">—</span>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[13px] text-muted-foreground">Nothing yet — e.g. enrolment number, registration number, office contacts.</p>
      )}
    </section>
  );
}
