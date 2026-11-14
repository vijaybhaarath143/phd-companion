"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { ActionForm } from "@/components/app/action-form";
import { createExperiment, createManuscript, updateProject } from "@/server/actions/research";
import { addLink, removeLink } from "@/server/actions/entries";
import { quickTask, toggleTask } from "@/server/actions/tasks";
import { projectStatuses } from "@/lib/labels";
import type { ProjectRow } from "@/server/research";

type Props =
  | { kind: "manuscript" | "experiment"; projectId: string }
  | { kind: "tasks"; projectId: string; tasks: { id: string; title: string; status: string; waitingReason: string | null }[] }
  | { kind: "about"; projectId: string; project: ProjectRow }
  | { kind: "evidence"; projectId: string; links: { id: string; url: string; label: string | null }[] };

export function ProjectActions(props: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (props.kind === "manuscript" || props.kind === "experiment") {
    const label = props.kind === "manuscript" ? "Add manuscript" : "Add experiment";
    return open ? (
      <ActionForm
        action={(props.kind === "manuscript" ? createManuscript : createExperiment).bind(null, props.projectId)}
        reset={false}
        className="flex w-full flex-wrap gap-2"
      >
        <Input name="title" required autoFocus placeholder={props.kind === "manuscript" ? "Manuscript title" : "Experiment title"} aria-label="Title" className="min-w-0 flex-[1_1_220px]" />
        <Button type="submit">Create</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </ActionForm>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-3.5" aria-hidden /> {label}</Button>
    );
  }

  if (props.kind === "tasks") {
    return (
      <>
        {props.tasks.length > 0 && (
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {props.tasks.map((t) => (
              <li key={t.id} className="flex min-h-12 items-center gap-3 px-5 py-2.5">
                <input type="checkbox" className="size-[18px] shrink-0 accent-zinc-900" aria-label={`Done: ${t.title}`}
                  onChange={(e) => start(async () => void (await toggleTask(t.id, e.target.checked)))} disabled={pending} />
                <span className="min-w-0 flex-1">{t.title}</span>
                {t.status === "waiting" && <Badge variant="attention">{t.waitingReason ? "Waiting" : "Waiting"}</Badge>}
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={quickTask} className="flex gap-2 border-t border-zinc-100 px-5 py-3">
          <input type="hidden" name="projectId" value={props.projectId} />
          <Input name="title" required placeholder="Add a task to this project…" aria-label="New task" />
          <Button type="submit" variant="outline">Add</Button>
        </ActionForm>
      </>
    );
  }

  if (props.kind === "about") {
    const p = props.project;
    return (
      <section className="rounded-xl border bg-card px-5 py-4">
        <h2 className="mb-3 text-[15px] font-semibold">About</h2>
        <ActionForm action={updateProject.bind(null, p.id)} reset={false} success="Saved" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-status" className="text-sm font-medium">Status</label>
            <NativeSelect id="p-status" name="status" defaultValue={p.status}>
              {Object.entries(projectStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-obj" className="text-sm font-medium">Objective</label>
            <Textarea id="p-obj" name="objective" rows={3} defaultValue={p.objective ?? ""} placeholder="What this project sets out to do (optional)" />
          </div>
          <p className="text-[13px] text-muted-foreground">Project status is separate from manuscript status — finishing a project doesn&apos;t mark a paper as published.</p>
          <Button type="submit" variant="outline" className="self-start">Save</Button>
        </ActionForm>
      </section>
    );
  }

  if (props.kind !== "evidence") return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4">
      <h2 className="text-[15px] font-semibold">Evidence</h2>
      {props.links.length === 0 && <p className="text-[13px] text-muted-foreground">No links yet. Add drafts, figures or a shared folder.</p>}
      {props.links.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          <a href={l.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate underline underline-offset-4">{l.label || l.url}</a>
          <button type="button" aria-label="Remove link" onClick={() => start(async () => void (await removeLink(l.id)))} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </div>
      ))}
      <ActionForm action={addLink.bind(null, "project", props.projectId)} success="Link added" className="flex flex-col gap-2">
        <Input name="url" type="url" required placeholder="https://…" aria-label="Link" />
        <Input name="label" placeholder="Label (optional)" aria-label="Link label" />
        <Button type="submit" variant="outline" className="self-start"><Plus className="size-4" aria-hidden /> Add link</Button>
      </ActionForm>
    </section>
  );
}
