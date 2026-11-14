"use client";

import Link from "next/link";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions, rowOptions } from "@/lib/options";
import { Badge } from "@/components/ui/badge";
import { SaveStatus, useAutosave } from "@/components/app/autosave";
import { ActionForm, SaveError } from "@/components/app/action-form";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { Breadcrumb } from "@/components/app/ui";
import { callAction, quickAction, trashWithUndo } from "@/components/app/call-action";
import { undoTrash } from "@/server/actions/settings";
import { useRouter } from "next/navigation";
import { addBlocker, archiveExperiment, resolveBlocker, trashExperiment, updateExperiment, updateExperimentDetails } from "@/server/actions/research";
import { setEntryDate } from "@/server/actions/entries";
import { Evidence } from "@/components/app/evidence";
import type { EvidenceItem } from "@/server/evidence";
import type { ProjectOption } from "@/server/profile";
import { blockerCategories, experimentStatuses } from "@/lib/labels";
import { formatFullDay, formatPartialDate, type PartialDate, type Precision } from "@/lib/dates";

type Fields = { objective: string; materials: string; procedure: string; observations: string; interpretation: string; outcome: string; nextSteps: string };
type Patch = Partial<Fields> & { status?: string | null };
type Revision = Partial<Record<keyof Fields, string | null>> & { id: string; revisionNo: number; capturedLabel: string; status: string | null };

const SESSION_IDLE_MS = 10 * 60 * 1000;
const FIELD_LABELS: Record<keyof Fields, string> = {
  objective: "Objective",
  materials: "Materials and instruments",
  procedure: "Procedure",
  observations: "Observations",
  interpretation: "Interpretation",
  outcome: "Outcome",
  nextSteps: "Next steps",
};

/**
 * One editing session per visit, and a new one after 10 idle minutes. The database
 * keeps the previous text as an earlier version whenever a new session changes it.
 */
function touchSession(s: { id: string | null; last: number }) {
  const now = Date.now();
  if (!s.id || now - s.last > SESSION_IDLE_MS) s.id = crypto.randomUUID();
  s.last = now;
  return s.id;
}

export function ExperimentEditor({
  entry,
  experiment,
  project,
  projects,
  revisions,
  blockers,
  evidence,
  today,
  openDate = false,
  trials,
}: {
  entry: { id: string; title: string; entryDate: string | null; entryPrecision: Precision; projectId: string | null; version: number; archivedAt: Date | null };
  experiment: Partial<Record<keyof Fields, string | null>> & { status: string | null; version: number };
  project: { id: string; title: string } | null;
  projects: ProjectOption[];
  revisions: Revision[];
  blockers: { id: string; category: string; description: string; openedOn: string; resolvedOn: string | null }[];
  evidence: EvidenceItem[];
  today: string;
  openDate?: boolean;
  /** The Trials section, rendered on the server page. */
  trials?: ReactNode;
}) {
  const [f, setF] = useState<Fields>({
    objective: experiment.objective ?? "",
    materials: experiment.materials ?? "",
    procedure: experiment.procedure ?? "",
    observations: experiment.observations ?? "",
    interpretation: experiment.interpretation ?? "",
    outcome: experiment.outcome ?? "",
    nextSteps: experiment.nextSteps ?? "",
  });
  // The status goes through the same autosave as the text, so changing it never leaves
  // the page holding an old version (which would make the next save look like a conflict).
  const [status, setStatus] = useState(experiment.status);
  const session = useRef<{ id: string | null; last: number }>({ id: null, last: 0 });
  const auto = useAutosave<Patch>(
    experiment.version,
    (version, patch) => updateExperiment(entry.id, version, session.current.id ?? "", patch),
    (a, b) => ({ ...a, ...b }),
  );
  const [pending, start] = useTransition();
  const router = useRouter();
  const [viewing, setViewing] = useState<string | null>(null);
  const [date, setDate] = useState<PartialDate>({ date: entry.entryDate, precision: entry.entryPrecision });
  const [editingDate, setEditingDate] = useState(openDate);
  const [draftDate, setDraftDate] = useState<PartialDate>(date.precision === "none" ? { date: today, precision: "day" } : date);
  const [entryVersion, setEntryVersion] = useState(entry.version);
  const [title, setTitle] = useState(entry.title);
  const [projectId, setProjectId] = useState(entry.projectId ?? "");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const set = (k: keyof Fields, value: string) => {
    touchSession(session.current);
    setF((s) => ({ ...s, [k]: value }));
    auto.schedule({ [k]: value });
  };

  const copyText = () =>
    [title, ...(Object.keys(FIELD_LABELS) as (keyof Fields)[]).filter((k) => f[k]).map((k) => `${FIELD_LABELS[k]}:\n${f[k]}`)].join("\n\n");

  const area = (k: keyof Fields, label: string, help: string | null, rows: number) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`x-${k}`} className="font-medium">{label}</label>
      {help && <p className="mb-1 text-[13px] text-muted-foreground">{help}</p>}
      <Textarea id={`x-${k}`} rows={rows} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  const saveDetails = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const next = { title: String(data.get("title") ?? ""), projectId: String(data.get("projectId") ?? "") || null };
    setDetailsError(null);
    start(async () => {
      const r = await callAction(() => updateExperimentDetails(entry.id, entryVersion, next));
      if (!r) return;
      if (!r.ok) return void setDetailsError(r.error.message);
      setEntryVersion(r.data.version);
      setTitle(next.title.trim());
      setProjectId(next.projectId ?? "");
      setEditingDetails(false);
      toast.success("Saved");
    });
  };

  /** Archive / Trash: only after everything typed has saved. */
  const leave = (how: "archive" | "trash") =>
    start(async () => {
      if (!(await auto.flush())) return void toast.error("Your latest changes haven't saved yet — copy your text or try again first.");
      if (how === "archive") return void (await quickAction(() => archiveExperiment(entry.id)));
      await trashWithUndo({ what: "Experiment", trash: () => trashExperiment(entry.id), undo: () => undoTrash("entries", entry.id), onUndone: () => router.push(`/research/experiments/${entry.id}`) });
    });

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb items={[...(project ? [{ href: `/research/projects/${project.id}`, label: project.title.split(":")[0] }] : [{ href: "/research", label: "Research" }]), { label: "Experiment" }]} />
        <SaveStatus state={auto.state} message={auto.message} onRetry={() => void auto.retry()} copyText={copyText} />
      </div>

      {entry.archivedAt && (
        <p className="rounded-lg border border-attention-border bg-attention px-4 py-2.5 text-[13px] text-attention-foreground">
          This experiment is archived — hidden from its project and the Journal, but kept. <Link href="/settings#archive" className="font-medium underline underline-offset-2">Restore it from Settings</Link>.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {editingDetails ? (
          <form
            className="flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveDetails(e.currentTarget);
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="x-title" className="text-sm font-medium">Experiment title</label>
              <Input id="x-title" name="title" required maxLength={300} defaultValue={title} autoFocus />
            </div>
            <div className="flex max-w-96 flex-col gap-1.5">
              <label htmlFor="x-project" className="text-sm font-medium">Project</label>
              <AppSelect id="x-project" name="projectId" defaultValue={projectId} options={rowOptions(projects, (p) => p.title, "No project")} />
            </div>
            {detailsError && <SaveError message={detailsError} />}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingDetails(false); setDetailsError(null); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 flex-[1_1_320px] text-2xl leading-8 font-semibold tracking-[-0.015em]">{title}</h1>
            <Button size="sm" variant="outline" onClick={() => setEditingDetails(true)}>Rename or move</Button>
          </div>
        )}
        {editingDate ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
            <PartialDateInput name="xd" label="Date performed" today={today} defaultValue={date.precision === "none" ? { date: today, precision: "day" } : date} onChange={setDraftDate} />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => start(async () => {
                const r = await callAction(() => setEntryDate(entry.id, entryVersion, draftDate));
                if (!r) return;
                if (!r.ok) return void toast.error(r.error.message);
                setEntryVersion(r.data.version);
                setDate(draftDate);
                setEditingDate(false);
              })}>Save date</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingDate(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Date performed: {date.precision === "none" ? "not set" : formatPartialDate(date.date, date.precision)} ·{" "}
            <button type="button" className="text-foreground underline underline-offset-4" onClick={() => setEditingDate(true)}>{date.precision === "none" ? "Add date" : "Change"}</button>
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Status</h2>
          <span className="text-[13px] text-muted-foreground">{status ? "" : "Not set. "}Failed and unclear results are saved like any other.</span>
        </div>
        <div role="radiogroup" aria-label="Experiment status" className="flex flex-wrap gap-2">
          {Object.entries(experimentStatuses).map(([k, v]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={status === k}
              onClick={() => {
                touchSession(session.current);
                setStatus(k);
                auto.schedule({ status: k }, 0);
              }}
              className={cn("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                status === k ? "border-primary bg-primary text-primary-foreground" : "bg-background text-zinc-700 hover:bg-muted")}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-4">
          <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
            {area("objective", "Objective", "What were you trying to find out?", 2)}
            {area("materials", "Materials and instruments", null, 2)}
            {area("procedure", "Procedure", "Steps you followed. If you change this later, the earlier version is kept.", 5)}
          </section>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            <section className="rounded-xl border bg-card p-5">{area("observations", "Observations", "What you saw or measured.", 6)}</section>
            <section className="rounded-xl border bg-card p-5">{area("interpretation", "Interpretation", "What you think it means.", 6)}</section>
          </div>
          <section className="flex flex-col gap-5 rounded-xl border bg-card p-5">
            {area("outcome", "Outcome", null, 2)}
            {area("nextSteps", "Next steps", null, 2)}
          </section>
          {trials}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-muted-foreground">Incomplete is fine. Save what you have and come back later.</p>
            <div className="flex gap-1">
              {!entry.archivedAt && <Button variant="ghost" disabled={pending} onClick={() => leave("archive")}>Archive</Button>}
              <Button variant="ghost" disabled={pending} onClick={() => leave("trash")}>Move to Trash</Button>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-4">
          <section className="rounded-xl border bg-card px-5 py-4">
            <h2 className="mb-1 text-[15px] font-semibold">Earlier versions</h2>
            <ol>
              <li className="flex items-center gap-3 border-t border-zinc-100 py-2.5 first:border-t-0">
                <span className="flex-1"><span className="block font-medium">Current version</span></span>
              </li>
              {revisions.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 border-t border-zinc-100 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex-1">
                      <span className="block font-medium">Version {r.revisionNo}</span>
                      <span className="block text-[13px] text-muted-foreground">{r.capturedLabel} · read-only</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setViewing(viewing === r.id ? null : r.id)}>{viewing === r.id ? "Hide" : "View"}</Button>
                  </div>
                  {viewing === r.id && (
                    <dl className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-[13px]">
                      {(Object.keys(FIELD_LABELS) as (keyof Fields)[]).map((k) =>
                        r[k] ? (
                          <div key={k}>
                            <dt className="font-medium">{FIELD_LABELS[k]}</dt>
                            <dd className="whitespace-pre-line text-zinc-700">{r[k]}</dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {revisions.length ? "Earlier versions can't be edited or deleted." : "When you come back and change this record, the version before is kept here."}
            </p>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4">
            <h2 className="text-[15px] font-semibold">Blockers</h2>
            {blockers.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing blocking. Record things like equipment, supplies or a protocol that didn&apos;t work.</p>}
            {blockers.map((b) => (
              <div key={b.id} className="flex items-start gap-3 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0">
                <span className="flex-1">
                  <span className="block font-medium">{b.description}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {blockerCategories[b.category as keyof typeof blockerCategories]} · opened {formatFullDay(b.openedOn)}
                    {b.resolvedOn ? ` · resolved ${formatFullDay(b.resolvedOn)}` : ""}
                  </span>
                </span>
                {b.resolvedOn ? <Badge variant="muted">Resolved</Badge> : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => void (await quickAction(() => resolveBlocker(b.id))))}>Resolve</Button>
                )}
              </div>
            ))}
            <ActionForm action={addBlocker.bind(null, entry.id)} success="Blocker recorded" className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
              <Input name="description" required maxLength={1000} placeholder="What's blocking?" aria-label="Blocker" />
              <div className="flex gap-2">
                <AppSelect name="category" defaultValue="other" aria-label="Kind of blocker" options={toOptions(blockerCategories)} />
                <Button type="submit" variant="outline">Add</Button>
              </div>
            </ActionForm>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4">
            <h2 className="text-[15px] font-semibold">Evidence</h2>
            <Evidence items={evidence} parentType="entry" parentId={entry.id} hint="Photos, data files or a link to the instrument output." />
          </section>
        </div>
      </div>
    </div>
  );
}
