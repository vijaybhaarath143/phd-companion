"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions } from "@/lib/options";
import { ActionForm } from "@/components/app/action-form";
import { createExperiment, createManuscript, updateProject } from "@/server/actions/research";
import { quickTask } from "@/server/actions/tasks";
import { TaskCheckbox } from "@/components/app/task-checkbox";
import { projectStatuses } from "@/lib/labels";
import type { ProjectRow } from "@/server/research";

type Props =
  | { kind: "manuscript" | "experiment"; projectId: string }
  | { kind: "tasks"; projectId: string; tasks: { id: string; title: string; status: string; waitingReason: string | null }[] }
  | { kind: "about"; projectId: string; project: ProjectRow };

/** Remembers this project on this device, so Research opens it next time (read in research/page.tsx). */
export function RememberProject({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `last_project=${id}; path=/research; max-age=${60 * 60 * 24 * 365}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [id]);
  return null;
}

export function ProjectActions(props: Props) {
  const [open, setOpen] = useState(false);

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
                <TaskCheckbox id={t.id} title={t.title} done={t.status === "done"} />
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
          <input type="hidden" name="version" value={p.version} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-title" className="text-sm font-medium">Title</label>
            <Input id="p-title" name="title" required maxLength={300} defaultValue={p.title} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-status" className="text-sm font-medium">Status</label>
            <AppSelect id="p-status" name="status" defaultValue={p.status} options={toOptions(projectStatuses)} />
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

  return null;
}
