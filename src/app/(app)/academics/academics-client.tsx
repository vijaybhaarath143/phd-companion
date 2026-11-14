"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionForm } from "@/components/app/action-form";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { addCourse, addEnquiry, addMilestone, recordRecognition, saveRequirement, setMilestoneStatus, updateCourse, updateEnquiry } from "@/server/actions/academics";
import { formatCredits } from "@/lib/credits";
import { formatFullDay, formatPartialDate, type Precision } from "@/lib/dates";
import { courseStatuses, enquiryStatuses, milestoneStatuses, suggestedMilestones } from "@/lib/labels";
import type { ProjectOption } from "@/server/profile";

export function RequirementEditor({ requirement }: { requirement: { label: string; periodLabel: string | null; requiredCredits: number | null } | null }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{requirement ? "Edit requirement" : "Set requirement"}</Button>;
  return (
    <ActionForm action={saveRequirement} success="Saved" reset={false} onDone={() => setOpen(false)} className="flex w-full flex-wrap items-end gap-3 rounded-lg border bg-zinc-50 p-4">
      <div className="flex flex-col gap-1.5"><label htmlFor="rq-l" className="text-sm font-medium">Name</label><Input id="rq-l" name="label" defaultValue={requirement?.label ?? "Coursework credits"} className="w-56" /></div>
      <div className="flex flex-col gap-1.5"><label htmlFor="rq-p" className="text-sm font-medium">Period</label><Input id="rq-p" name="period" defaultValue={requirement?.periodLabel ?? ""} placeholder="e.g. First year" className="w-40" /></div>
      <div className="flex flex-col gap-1.5"><label htmlFor="rq-c" className="text-sm font-medium">Credits required</label><Input id="rq-c" name="credits" inputMode="decimal" defaultValue={requirement?.requiredCredits ?? ""} className="w-32" /></div>
      <Button type="submit">Save</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </ActionForm>
  );
}

type Course = { id: string; name: string; provider: string | null; credits: number | null; status: string; completedOn: string | null; recognised: number };

export function CoursesSection({ courses, today }: { courses: Course[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [recognising, setRecognising] = useState<string | null>(null);
  return (
    <section data-guide="courses" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold">Courses</h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}><Plus className="size-3.5" aria-hidden /> Add course</Button>
      </div>
      {adding && (
        <ActionForm action={addCourse} success="Course added" onDone={() => setAdding(false)} className="mx-5 mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-zinc-50 p-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="c-n" className="text-sm font-medium">Course</label><Input id="c-n" name="name" required className="w-60" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="c-p" className="text-sm font-medium">Provider</label><Input id="c-p" name="provider" className="w-44" placeholder="e.g. SWAYAM" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="c-c" className="text-sm font-medium">Credits <span className="font-normal text-muted-foreground">(leave blank if unknown)</span></label><Input id="c-c" name="credits" inputMode="decimal" className="w-32" /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="c-s" className="text-sm font-medium">Status</label>
            <NativeSelect id="c-s" name="status" defaultValue="enrolled" className="w-40">{Object.entries(courseStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></div>
          <Button type="submit">Add</Button>
        </ActionForm>
      )}
      {courses.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">No courses yet.</p>
      ) : (
        <div className="overflow-x-auto border-t border-zinc-100">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Course</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead>
                <TableHead>Credits</TableHead><TableHead>Officially recognised</TableHead><TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => (
                <Fragment key={c.id}>
                  <TableRow>
                    <TableCell className="pl-5 font-medium">{c.name}</TableCell>
                    <TableCell>{c.provider ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{courseStatuses[c.status as keyof typeof courseStatuses]}</Badge></TableCell>
                    <TableCell className={c.credits === null ? "text-muted-foreground" : "tabular-nums"}>{c.credits === null ? "Not recorded" : formatCredits(c.credits)}</TableCell>
                    <TableCell className="tabular-nums">
                      {c.recognised > 0 ? formatCredits(c.recognised) : <span className="text-muted-foreground">—</span>}
                      {c.status === "completed" && c.credits !== null && c.recognised < c.credits && <span className="block text-[12px] text-muted-foreground">{formatCredits(c.credits - c.recognised)} not yet recognised</span>}
                    </TableCell>
                    <TableCell className="pr-5 text-right whitespace-nowrap">
                      {c.status === "completed" && <Button size="sm" variant="outline" className="mr-2" onClick={() => setRecognising(recognising === c.id ? null : c.id)}>Record recognition</Button>}
                      <Button size="sm" variant="outline" onClick={() => setEditing(editing === c.id ? null : c.id)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                  {editing === c.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="px-5">
                        <ActionForm action={updateCourse.bind(null, c.id)} success="Course saved" reset={false} onDone={() => setEditing(null)} className="flex flex-wrap items-end gap-3 rounded-lg border bg-zinc-50 p-4">
                          <div className="flex flex-col gap-1.5"><label htmlFor={`cs-${c.id}`} className="text-sm font-medium">Status</label>
                            <NativeSelect id={`cs-${c.id}`} name="status" defaultValue={c.status} className="w-40">{Object.entries(courseStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></div>
                          <div className="flex flex-col gap-1.5"><label htmlFor={`cc-${c.id}`} className="text-sm font-medium">Credits <span className="font-normal text-muted-foreground">(blank = unknown)</span></label>
                            <Input id={`cc-${c.id}`} name="credits" inputMode="decimal" defaultValue={c.credits ?? ""} className="w-32" /></div>
                          <Button type="submit">Save</Button>
                          <p className="w-full text-[13px] text-muted-foreground">Marking a course completed doesn&apos;t record any official recognition — that&apos;s a separate step.</p>
                        </ActionForm>
                      </TableCell>
                    </TableRow>
                  )}
                  {recognising === c.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="px-5 whitespace-normal">
                        <ActionForm action={recordRecognition.bind(null, c.id)} success="Recognition recorded" onDone={() => setRecognising(null)} className="flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1.5"><label htmlFor={`ra-${c.id}`} className="text-sm font-medium">Credits recognised</label>
                              <Input id={`ra-${c.id}`} name="amount" inputMode="decimal" required className="w-32" /></div>
                            <div className="flex flex-col gap-1.5"><label htmlFor={`rr-${c.id}`} className="text-sm font-medium">Reference <span className="font-normal text-muted-foreground">(optional)</span></label>
                              <Input id={`rr-${c.id}`} name="reference" placeholder="e.g. office letter number" className="w-60" /></div>
                          </div>
                          <PartialDateInput name="recognised" label="Recognised on" today={today} />
                          <Button type="submit" className="self-start">Save</Button>
                        </ActionForm>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="border-t border-zinc-100 px-5 py-3 text-[13px] text-muted-foreground">Course status: Planned → Enrolled → Completed (or Dropped). After completion, use “Record recognition” — it can be partial.</p>
    </section>
  );
}

type Milestone = { id: string; title: string; status: string; targetDate: string | null; targetPrecision: Precision; doneOn: string | null; donePrecision: Precision; projectTitle: string | null };

export function MilestonesSection({ milestones, projects, today }: { milestones: Milestone[]; projects: ProjectOption[]; today: string }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const existing = new Set(milestones.map((m) => m.title.toLowerCase()));
  return (
    <section data-guide="milestones" className="min-w-0 flex-[3_1_420px] rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold">Milestones</h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(adding === null ? "" : null)}>Add milestone</Button>
      </div>
      {adding !== null && (
        <ActionForm key={adding} action={addMilestone} success="Milestone added" onDone={() => setAdding(null)} className="mx-5 mb-4 flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
          <div className="flex flex-col gap-1.5"><label htmlFor="m-t" className="text-sm font-medium">Milestone</label><Input id="m-t" name="title" required defaultValue={adding} /></div>
          <PartialDateInput name="target" label="Target date" today={today} noneLabel="No date yet" defaultValue={{ date: null, precision: "none" }} />
          <div className="flex flex-col gap-1.5"><label htmlFor="m-p" className="text-sm font-medium">Project <span className="font-normal text-muted-foreground">(optional)</span></label>
            <NativeSelect id="m-p" name="projectId" defaultValue=""><option value="">Not a project milestone</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</NativeSelect></div>
          <Button type="submit" className="self-start">Add</Button>
        </ActionForm>
      )}
      {milestones.length > 0 && (
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
          {milestones.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.title}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {m.status === "done"
                      ? m.donePrecision === "none" ? "Done · date not recorded" : `Done ${formatPartialDate(m.doneOn, m.donePrecision)}`
                      : m.targetPrecision === "none" ? "No target date" : `Target ${formatPartialDate(m.targetDate, m.targetPrecision)}`}
                    {m.projectTitle ? ` · ${m.projectTitle.split(":")[0]}` : ""}
                  </span>
                </span>
                <Badge variant={m.status === "done" ? "default" : "outline"}>{milestoneStatuses[m.status as keyof typeof milestoneStatuses]}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setMarking(marking === m.id ? null : m.id)}>Update</Button>
              </div>
              {marking === m.id && (
                <ActionForm action={setMilestoneStatus.bind(null, m.id)} success="Saved" onDone={() => setMarking(null)} className="flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
                  <div className="flex max-w-60 flex-col gap-1.5"><label htmlFor={`ms-${m.id}`} className="text-sm font-medium">Status</label>
                    <NativeSelect id={`ms-${m.id}`} name="status" defaultValue={m.status}>{Object.entries(milestoneStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></div>
                  <PartialDateInput name="done" label="If done: when?" today={today} noneLabel="Not sure" />
                  <Button type="submit" className="self-start">Save</Button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2.5 border-t border-zinc-100 px-5 py-4">
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

type Enquiry = { entryId: string; title: string; office: string | null; contact: string | null; response: string | null; followUpDate: string | null; status: string };

export function EnquiriesSection({ enquiries, today }: { enquiries: Enquiry[]; today: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section id="enquiries" data-guide="enquiries" className="min-w-0 flex-[2_1_300px] scroll-mt-6 rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold">Office enquiries</h2>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>Add enquiry</Button>
      </div>
      {adding && (
        <ActionForm action={addEnquiry} success="Enquiry added" onDone={() => setAdding(false)} className="mx-5 mb-4 flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
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
        <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
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
                  <ActionForm action={updateEnquiry.bind(null, q.entryId)} success="Saved" reset={false} onDone={() => setEditing(null)} className="flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
                    <div className="flex flex-col gap-1.5"><label htmlFor={`qr-${q.entryId}`} className="text-sm font-medium">Response</label><Textarea id={`qr-${q.entryId}`} name="response" rows={2} defaultValue={q.response ?? ""} /></div>
                    <div className="flex flex-wrap gap-3">
                      <div className="flex flex-col gap-1.5"><label htmlFor={`qf-${q.entryId}`} className="text-sm font-medium">Follow up on</label><Input id={`qf-${q.entryId}`} type="date" name="followUp" defaultValue={q.followUpDate ?? ""} className="w-44" /></div>
                      <div className="flex flex-col gap-1.5"><label htmlFor={`qs-${q.entryId}`} className="text-sm font-medium">Status</label>
                        <NativeSelect id={`qs-${q.entryId}`} name="status" defaultValue={q.status} className="w-48">{Object.entries(enquiryStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></div>
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
