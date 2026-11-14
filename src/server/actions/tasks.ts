"use server";

import { refresh } from "next/cache";
import { run, ValidationError, oneOf, uuidOrNull, dateOrNull, text } from "@/server/actions/run";

export type NewTask = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: "normal" | "important";
  projectId: string | null;
  notes: string | null;
  originEntryId?: string | null;
  manuscriptId?: string | null;
};

export async function createTask(input: NewTask) {
  return run(async (tx) => {
    const id = uuidOrNull(input.id);
    if (!id) throw new ValidationError("Something went wrong — please try again.");
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) throw new ValidationError("Add a title.");
    if (title.length > 300) throw new ValidationError("Please keep the title under 300 characters.");

    // A task keeps its origin; its project comes from what was chosen, never silently swapped.
    let projectId = uuidOrNull(input.projectId);
    const originEntryId = uuidOrNull(input.originEntryId);
    if (originEntryId && !projectId) {
      const [origin] = await tx<{ projectId: string | null }[]>`select project_id from public.entries where id = ${originEntryId}`;
      projectId = origin?.projectId ?? null;
    }
    await tx`
      insert into public.tasks (id, title, due_date, priority, project_id, notes, origin_entry_id, manuscript_id)
      values (${id}, ${title}, ${dateOrNull(input.dueDate)}, ${oneOf(input.priority, ["normal", "important"] as const, "normal")},
              ${projectId}, ${input.notes?.trim() || null}, ${originEntryId}, ${uuidOrNull(input.manuscriptId)})
      on conflict (id) do nothing`;
    refresh();
    return { id };
  });
}

export async function quickTask(form: FormData) {
  return createTask({
    id: crypto.randomUUID(),
    title: String(form.get("title") ?? ""),
    dueDate: null,
    priority: "normal",
    projectId: uuidOrNull(form.get("projectId")),
    notes: null,
    originEntryId: uuidOrNull(form.get("originEntryId")),
    manuscriptId: uuidOrNull(form.get("manuscriptId")),
  });
}

export async function toggleTask(id: string, done: boolean) {
  return run(async (tx) => {
    await tx`
      update public.tasks
      set status = ${done ? "done" : "todo"}, completed_at = ${done ? tx`now()` : null},
          waiting_reason = case when ${done} then waiting_reason else null end,
          version = version + 1
      where id = ${id}`;
    refresh();
  });
}

export async function updateTask(id: string, form: FormData) {
  return run(async (tx) => {
    const title = text(form.get("title"), 300);
    if (!title) throw new ValidationError("Add a title.");
    const status = oneOf(form.get("status"), ["todo", "doing", "waiting", "done", "cancelled"] as const, "todo")!;
    const waitingOn = status === "waiting" ? uuidOrNull(form.get("waitingOnTaskId")) : null;
    if (waitingOn === id) throw new ValidationError("A task can't wait on itself.");
    await tx`
      update public.tasks set
        title = ${title},
        status = ${status},
        priority = ${oneOf(form.get("priority"), ["normal", "important"] as const, "normal")},
        due_date = ${dateOrNull(form.get("dueDate"))},
        notes = ${text(form.get("notes"), 5000)},
        project_id = ${uuidOrNull(form.get("projectId"))},
        waiting_reason = ${status === "waiting" ? text(form.get("waitingReason"), 300) : null},
        waiting_on_task_id = ${waitingOn},
        completed_at = case when ${status} in ('done', 'cancelled') then coalesce(completed_at, now()) else null end,
        version = version + 1
      where id = ${id}`;
    refresh();
  });
}

export async function trashTask(id: string) {
  return run(async (tx) => {
    await tx`update public.tasks set deleted_at = now(), version = version + 1 where id = ${id}`;
    refresh();
  });
}

export async function restoreTask(id: string) {
  return run(async (tx) => {
    await tx`update public.tasks set deleted_at = null, version = version + 1 where id = ${id}`;
    refresh();
  });
}
