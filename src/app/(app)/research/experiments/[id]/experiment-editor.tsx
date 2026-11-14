"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { SaveStatus, useAutosave } from "@/components/app/autosave";
import { ActionForm } from "@/components/app/action-form";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { Breadcrumb } from "@/components/app/ui";
import { addBlocker, resolveBlocker, setExperimentStatus, updateExperiment } from "@/server/actions/research";
import { setEntryDate } from "@/server/actions/entries";
import { Evidence } from "@/components/app/evidence";
import type { EvidenceItem } from "@/server/evidence";
import { blockerCategories, experimentStatuses } from "@/lib/labels";
import { formatFullDay, formatPartialDate, type PartialDate, type Precision } from "@/lib/dates";

type Fields = { objective: string; materials: string; procedure: string; observations: string; interpretation: string; outcome: string; nextSteps: string };
type Revision = Partial<Record<keyof Fields, string | null>> & { id: string; revisionNo: number; capturedAt: Date; status: string | null };

const SESSION_IDLE_MS = 10 * 60 * 1000;

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
  revisions,
  blockers,
  evidence,
  today,
  openDate = false,
}: {
  entry: { id: string; title: string; entryDate: string | null; entryPrecision: Precision; version: number };
  experiment: Partial<Record<keyof Fields, string | null>> & { status: string | null; version: number; updatedAt: Date };
  project: { id: string; title: string } | null;
  revisions: Revision[];
  blockers: { id: string; category: string; description: string; openedOn: string; resolvedOn: string | null }[];
  evidence: EvidenceItem[];
  today: string;
  openDate?: boolean;
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
  const session = useRef<{ id: string | null; last: number }>({ id: null, last: 0 });
  const auto = useAutosave<Partial<Fields>>(
    experiment.version,
    (version, patch) => updateExperiment(entry.id, version, session.current.id ?? "", patch),
    (a, b) => ({ ...a, ...b }),
  );
  const [pending, start] = useTransition();
  const [viewing, setViewing] = useState<string | null>(null);
  const [date, setDate] = useState<PartialDate>({ date: entry.entryDate, precision: entry.entryPrecision });
  const [editingDate, setEditingDate] = useState(openDate);
  const [draftDate, setDraftDate] = useState<PartialDate>(date.precision === "none" ? { date: today, precision: "day" } : date);
  const [entryVersion, setEntryVersion] = useState(entry.version);

  const set = (k: keyof Fields, value: string) => {
    touchSession(session.current);
    setF((s) => ({ ...s, [k]: value }));
    auto.schedule({ [k]: value });
  };

  const area = (k: keyof Fields, label: string, help: string | null, rows: number) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`x-${k}`} className="font-medium">{label}</label>
      {help && <p className="mb-1 text-[13px] text-muted-foreground">{help}</p>}
      <Textarea id={`x-${k}`} rows={rows} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb items={[...(project ? [{ href: `/research/projects/${project.id}`, label: project.title.split(":")[0] }] : [{ href: "/research", label: "Research" }]), { label: "Experiment" }]} />
        <SaveStatus state={auto.state} message={auto.message} onRetry={() => void auto.flush()} copyText={() => Object.values(f).filter(Boolean).join("\n\n")} />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em]">{entry.title}</h1>
        {editingDate ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-zinc-50 p-4">
            <PartialDateInput name="xd" label="Date performed" today={today} defaultValue={date.precision === "none" ? { date: today, precision: "day" } : date} onChange={setDraftDate} />
            <div className="flex gap-2">
              <Button size="sm" disabled={pending} onClick={() => start(async () => {
                const r = await setEntryDate(entry.id, entryVersion, draftDate);
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
          <span className="text-[13px] text-muted-foreground">{experiment.status ? "" : "Not set. "}Failed and unclear results are saved like any other.</span>
        </div>
        <div role="radiogroup" aria-label="Experiment status" className="flex flex-wrap gap-2">
          {Object.entries(experimentStatuses).map(([k, v]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={experiment.status === k}
              disabled={pending}
              onClick={() => start(async () => { const r = await setExperimentStatus(entry.id, k); if (!r.ok) toast.error(r.error.message); })}
              className={cn("h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                experiment.status === k ? "border-primary bg-primary text-primary-foreground" : "bg-background text-zinc-700 hover:bg-muted")}
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
          <p className="text-[13px] text-muted-foreground">Incomplete is fine. Save what you have and come back later.</p>
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
                      <span className="block text-[13px] text-muted-foreground">
                        {new Date(r.capturedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · read-only
                      </span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setViewing(viewing === r.id ? null : r.id)}>{viewing === r.id ? "Hide" : "View"}</Button>
                  </div>
                  {viewing === r.id && (
                    <dl className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 text-[13px]">
                      {(["objective", "materials", "procedure", "observations", "interpretation", "outcome", "nextSteps"] as const).map((k) =>
                        r[k] ? (
                          <div key={k}>
                            <dt className="font-medium capitalize">{k === "nextSteps" ? "Next steps" : k}</dt>
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
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => void (await resolveBlocker(b.id)))}>Resolve</Button>
                )}
              </div>
            ))}
            <ActionForm action={addBlocker.bind(null, entry.id)} success="Blocker recorded" className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
              <Input name="description" required placeholder="What's blocking?" aria-label="Blocker" />
              <div className="flex gap-2">
                <NativeSelect name="category" defaultValue="other" aria-label="Kind of blocker">
                  {Object.entries(blockerCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </NativeSelect>
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
