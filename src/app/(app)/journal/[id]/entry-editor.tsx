"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions, rowOptions } from "@/lib/options";
import { Badge } from "@/components/ui/badge";
import { SaveStatus, useAutosave } from "@/components/app/autosave";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { ActionForm } from "@/components/app/action-form";
import { Breadcrumb } from "@/components/app/ui";
import { archiveEntry, setEntryDate, trashEntry, updateEntry } from "@/server/actions/entries";
import { Evidence } from "@/components/app/evidence";
import { quickTask } from "@/server/actions/tasks";
import { TaskCheckbox } from "@/components/app/task-checkbox";
import { callAction, quickAction, trashWithUndo } from "@/components/app/call-action";
import { undoTrash } from "@/server/actions/settings";
import { useRouter } from "next/navigation";
import { categories, entryStatuses, participation, registration, enquiryStatuses, viaLabel } from "@/lib/labels";
import { formatPartialDate, type PartialDate } from "@/lib/dates";
import type { EntryDetail } from "@/server/journal";
import type { ProjectOption } from "@/server/profile";

type Patch = {
  entry?: Record<string, string | null>;
  event?: Record<string, string | null>;
  feedback?: Record<string, string | null>;
  enquiry?: Record<string, string | null>;
};
const merge = (a: Patch, b: Patch): Patch => ({
  entry: { ...a.entry, ...b.entry },
  event: { ...a.event, ...b.event },
  feedback: { ...a.feedback, ...b.feedback },
  enquiry: { ...a.enquiry, ...b.enquiry },
});

function Row({ label, htmlFor, children, top }: { label: string; htmlFor?: string; children: React.ReactNode; top?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-2 border-t border-zinc-100 px-5 py-3.5 first:border-t-0 ${top ? "items-start" : "items-center"}`}>
      <dt className={`w-40 shrink-0 font-medium text-zinc-700 ${top ? "pt-2.5" : ""}`}>{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</dt>
      <dd className="min-w-0 flex-[1_1_280px]">{children}</dd>
    </div>
  );
}

export function EntryEditor({ entry, projects, today, openDate = false }: { entry: EntryDetail; projects: ProjectOption[]; today: string; openDate?: boolean }) {
  const [v, setV] = useState({
    title: entry.title,
    category: entry.category ?? "",
    status: entry.status ?? "",
    description: entry.description ?? "",
    people: entry.people ?? "",
    outcome: entry.outcome ?? "",
    skillsLearned: entry.skillsLearned ?? "",
    projectId: entry.projectId ?? "",
    registration: entry.event?.registration ?? "",
    participation: entry.event?.participation ?? "unknown",
    award: entry.event?.award ?? "",
    submissionOutcome: entry.event?.submissionOutcome ?? "",
    requestedChanges: entry.feedback?.requestedChanges ?? "",
    source: entry.feedback?.source ?? "",
    office: entry.enquiry?.office ?? "",
    contact: entry.enquiry?.contact ?? "",
    response: entry.enquiry?.response ?? "",
    followUpDate: entry.enquiry?.followUpDate ?? "",
    enquiryStatus: entry.enquiry?.status ?? "open",
  });
  // The kind follows the category (e.g. "Conference" brings the event details), as the server decides.
  const [kind, setKind] = useState(entry.kind);
  const auto = useAutosave<Patch, { version: number; kind: string }>(
    entry.version,
    async (version, patch) => {
      const r = await updateEntry(entry.id, version, patch);
      if (r.ok) setKind(r.data.kind);
      return r;
    },
    merge,
  );
  const [date, setDate] = useState<PartialDate>({ date: entry.entryDate, precision: entry.entryPrecision });
  const [editingDate, setEditingDate] = useState(openDate);
  const [draftDate, setDraftDate] = useState<PartialDate>(date.precision === "none" ? { date: today, precision: "day" } : date);
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = (key: keyof typeof v, section: keyof Patch, column: string, value: string, delay?: number) => {
    setV((s) => ({ ...s, [key]: value }));
    auto.schedule({ [section]: { [column]: value } } as Patch, delay);
  };

  const isEvent = kind === "event" || Boolean(entry.event);
  // Everything typed on this page, so nothing is lost if saving fails.
  const copyText = () =>
    [
      v.title,
      formatPartialDate(date.date, date.precision),
      v.description && `Notes:\n${v.description}`,
      v.outcome && `Outcome: ${v.outcome}`,
      v.people && `People: ${v.people}`,
      v.skillsLearned && `Skills learned:\n${v.skillsLearned}`,
      v.award && `Award: ${v.award}`,
      v.submissionOutcome && `Submission outcome: ${v.submissionOutcome}`,
      v.source && `From: ${v.source}`,
      v.requestedChanges && `Requested changes:\n${v.requestedChanges}`,
      v.office && `Office: ${v.office}`,
      v.contact && `Contact: ${v.contact}`,
      v.response && `Response:\n${v.response}`,
      v.followUpDate && `Follow up on: ${v.followUpDate}`,
    ]
      .filter(Boolean)
      .join("\n\n");

  /** Archive / Trash: only after everything typed has saved. */
  const leave = (how: "archive" | "trash") =>
    start(async () => {
      if (!(await auto.flush())) return void toast.error("Your latest changes haven't saved yet — copy your text or try again first.");
      if (how === "archive") return void (await quickAction(() => archiveEntry(entry.id)));
      await trashWithUndo({ what: "Entry", trash: () => trashEntry(entry.id), undo: () => undoTrash("entries", entry.id), onUndone: () => router.push(`/journal/${entry.id}`) });
    });

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb items={[{ href: "/journal", label: "Journal" }, { label: "Entry" }]} />
        <SaveStatus state={auto.state} message={auto.message} onRetry={() => void auto.retry()} copyText={copyText} />
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block text-[13px] text-muted-foreground">Title</label>
        <textarea
          id="title"
          rows={1}
          value={v.title}
          onChange={(e) => set("title", "entry", "title", e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          className="field-sizing-content w-full resize-none bg-transparent text-2xl leading-8 font-semibold tracking-[-0.015em] outline-offset-4"
          maxLength={300}
        />
        {viaLabel(entry.createdVia) && <Badge variant="muted" className="mt-2">Added via {viaLabel(entry.createdVia)}</Badge>}
      </div>

      <section className="rounded-xl border bg-card">
        <dl>
          <Row label="Date">
            {editingDate ? (
              <div className="flex flex-col gap-3">
                <PartialDateInput name="entry" label="When did it happen?" today={today} defaultValue={date.precision === "none" ? { date: null, precision: "day" } : date} onChange={setDraftDate} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        // waits for any save already on its way, so the date goes with the fresh version
                        if (!(await auto.flush())) return void toast.error("Your latest changes haven't saved yet — try again in a moment.");
                        const r = await callAction(() => setEntryDate(entry.id, auto.version.current, draftDate));
                        if (!r) return;
                        if (!r.ok) return void toast.error(r.error.message);
                        auto.setVersion(r.data.version);
                        setDate(draftDate);
                        setEditingDate(false);
                        toast.success("Date saved");
                      })
                    }
                  >
                    Save date
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className={date.precision === "none" ? "text-muted-foreground" : ""}>{formatPartialDate(date.date, date.precision)}</span>
                <Button size="sm" variant="outline" onClick={() => { setDraftDate(date.precision === "none" ? { date: today, precision: "day" } : date); setEditingDate(true); }}>
                  {date.precision === "none" ? "Add date or month" : "Change"}
                </Button>
              </div>
            )}
          </Row>

          <Row label="Category" htmlFor="category">
            <AppSelect id="category" value={v.category} onValueChange={(x) => set("category", "entry", "category", x, 0)} className="max-w-72" options={toOptions(categories, "No category")} />
          </Row>

          <Row label="Status" htmlFor="status">
            <AppSelect id="status" value={v.status} onValueChange={(x) => set("status", "entry", "status", x, 0)} className="max-w-72" options={toOptions(entryStatuses, "Not set")} />
          </Row>

          {isEvent && (
            <>
              <Row label="Registration" htmlFor="registration">
                <AppSelect id="registration" value={v.registration} onValueChange={(x) => set("registration", "event", "registration", x, 0)} className="max-w-72" options={toOptions(registration, "Not recorded")} />
              </Row>
              <Row label="Participation" htmlFor="participation">
                <AppSelect id="participation" value={v.participation} onValueChange={(x) => set("participation", "event", "participation", x, 0)} className="max-w-72" options={toOptions(participation)} />
              </Row>
              <Row label="Award" htmlFor="award">
                <Input id="award" value={v.award} onChange={(e) => set("award", "event", "award", e.target.value)} placeholder="e.g. Third prize (optional)" className="max-w-72" />
              </Row>
              {(v.category === "competition" || v.submissionOutcome) && (
                <Row label="Submission outcome" htmlFor="sub-outcome">
                  <Input id="sub-outcome" value={v.submissionOutcome} onChange={(e) => set("submissionOutcome", "event", "submissionOutcome", e.target.value)} placeholder="e.g. Idea submitted" className="max-w-72" />
                </Row>
              )}
            </>
          )}

          {entry.feedback && (
            <>
              <Row label="From" htmlFor="source">
                <Input id="source" value={v.source} onChange={(e) => set("source", "feedback", "source", e.target.value)} />
              </Row>
              <Row label="Requested changes" htmlFor="changes" top>
                <Textarea id="changes" rows={4} value={v.requestedChanges} onChange={(e) => set("requestedChanges", "feedback", "requestedChanges", e.target.value)} />
              </Row>
              <Row label="Status">
                <span className="flex items-center gap-3">
                  <Badge variant={entry.feedback.resolutionStatus === "open" ? "attention" : "muted"}>{entry.feedback.resolutionStatus === "open" ? "Open" : "Resolved"}</Badge>
                  {entry.feedback.manuscriptId && <Link href={`/research/manuscripts/${entry.feedback.manuscriptId}`} className="text-[13px] underline-offset-4 hover:underline">Resolve on the manuscript page</Link>}
                </span>
              </Row>
            </>
          )}

          {entry.enquiry && (
            <>
              <Row label="Office" htmlFor="office"><Input id="office" value={v.office} onChange={(e) => set("office", "enquiry", "office", e.target.value)} /></Row>
              <Row label="Contact" htmlFor="contact"><Input id="contact" value={v.contact} onChange={(e) => set("contact", "enquiry", "contact", e.target.value)} /></Row>
              <Row label="Response" htmlFor="response" top><Textarea id="response" rows={3} value={v.response} onChange={(e) => set("response", "enquiry", "response", e.target.value)} /></Row>
              <Row label="Follow up on" htmlFor="followup"><Input id="followup" type="date" value={v.followUpDate} onChange={(e) => set("followUpDate", "enquiry", "followUpDate", e.target.value, 0)} className="max-w-48" /></Row>
              <Row label="Status" htmlFor="enq-status">
                <AppSelect id="enq-status" value={v.enquiryStatus} onValueChange={(x) => set("enquiryStatus", "enquiry", "status", x, 0)} className="max-w-72" options={toOptions(enquiryStatuses)} />
              </Row>
            </>
          )}

          {((!isEvent && !entry.feedback && !entry.enquiry) || v.outcome) && (
            <Row label="Outcome" htmlFor="outcome">
              <Input id="outcome" value={v.outcome} onChange={(e) => set("outcome", "entry", "outcome", e.target.value)} placeholder="What came of it (optional)" />
            </Row>
          )}

          <Row label="Project" htmlFor="project">
            <AppSelect id="project" value={v.projectId} onValueChange={(x) => set("projectId", "entry", "projectId", x, 0)} className="max-w-96" options={rowOptions(projects, (p) => p.title, "Not linked")} />
          </Row>

          <Row label="People" htmlFor="people">
            <Input id="people" value={v.people} onChange={(e) => set("people", "entry", "people", e.target.value)} placeholder="Who was involved (optional)" />
          </Row>

          <Row label="Notes" htmlFor="notes" top>
            <Textarea id="notes" rows={5} value={v.description} onChange={(e) => set("description", "entry", "description", e.target.value)} placeholder="What happened, what you decided, what’s next" />
          </Row>

          {(v.category === "training" || v.category === "conference" || v.skillsLearned) && (
            <Row label="Skills learned" htmlFor="skills" top>
              <Textarea id="skills" rows={2} value={v.skillsLearned} onChange={(e) => set("skillsLearned", "entry", "skillsLearned", e.target.value)} placeholder="Techniques or skills you picked up (optional)" />
            </Row>
          )}

          <Row label="Evidence" top>
            <Evidence items={entry.evidence} parentType="entry" parentId={entry.id} hint="Certificates, photos, documents or a link to them." />
          </Row>
        </dl>
      </section>

      <section className="rounded-xl border bg-card px-5 py-4">
        <h2 className="text-[15px] font-semibold">Follow-up</h2>
        {entry.tasks.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {entry.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-1.5">
                <TaskCheckbox id={t.id} title={t.title} done={t.status === "done"} />
                <span className={t.status === "done" ? "text-muted-foreground line-through" : ""}>{t.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No tasks from this entry yet.</p>
        )}
        <ActionForm action={quickTask} success="Task added" className="mt-3 flex gap-2">
          <input type="hidden" name="originEntryId" value={entry.id} />
          <input type="hidden" name="projectId" value={v.projectId} />
          <Input name="title" required placeholder="Add a task from this entry…" aria-label="New task" />
          <Button type="submit" variant="outline">Add</Button>
        </ActionForm>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">Changes save automatically.</p>
        <div className="flex gap-1">
          <Button variant="ghost" disabled={pending} onClick={() => leave("archive")}>Archive</Button>
          <Button variant="ghost" disabled={pending} onClick={() => leave("trash")}>Move to Trash</Button>
        </div>
      </div>
    </div>
  );
}
