"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/app/action-form";
import { TaskCheckbox } from "@/components/app/task-checkbox";
import { quickTask } from "@/server/actions/tasks";

/** A publication's open tasks, ticked off in place, with a box to add another. */
export function PublicationTasks({ manuscriptId, tasks }: { manuscriptId: string; tasks: { id: string; title: string; status: string; waitingReason: string | null }[] }) {
  return (
    <>
      {tasks.length > 0 && (
        <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
          {tasks.map((t) => (
            <li key={t.id} className="flex min-h-12 items-center gap-3 px-5 py-2.5">
              <TaskCheckbox id={t.id} title={t.title} done={t.status === "done"} />
              <span className="min-w-0 flex-1">{t.title}</span>
              {t.status === "waiting" && <Badge variant="attention">Waiting</Badge>}
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={quickTask} className="flex gap-2 border-t-2 border-zinc-100 px-5 py-3">
        <input type="hidden" name="manuscriptId" value={manuscriptId} />
        <Input name="title" required placeholder="Add a task for this publication…" aria-label="New task" />
        <Button type="submit" variant="outline">Add</Button>
      </ActionForm>
    </>
  );
}
