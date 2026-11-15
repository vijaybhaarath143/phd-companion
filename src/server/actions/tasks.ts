"use server";

import { refresh } from "next/cache";
import { run, ValidationError, oneOf, uuidOrNull, dateOrNull, text, versionOf, expectRow } from "@/server/actions/run";
import { insertTask, publicationOrNull, type NewTaskInput } from "@/server/writes";

export type NewTask = NewTaskInput;

export async function createTask(input: NewTask) {
  return run(async (tx) => {
    const r = await insertTask(tx, input);
    refresh();
    return r;
  });
}

export async function quickTask(form: FormData) {
  return createTask({
    id: crypto.randomUUID(),
    title: String(form.get("title") ?? ""),
    dueDate: null,
    priority: "normal",
    notes: null,
    originEntryId: uuidOrNull(form.get("originEntryId")),
    manuscriptId: uuidOrNull(form.get("manuscriptId")),
  });
}

export async function toggleTask(id: string, done: boolean) {
  return run(async (tx) => {
    const [row] = await tx`
      update public.tasks
      set status = ${done ? "done" : "todo"}, completed_at = ${done ? tx`now()` : null},
          waiting_reason = case when ${done} then waiting_reason else null end,
          version = version + 1
      where id = ${id} and deleted_at is null
      returning id`;
    if (!row) throw new ValidationError("That task wasn't found — it may have been moved to Trash.");
    refresh();
  });
}

/** The Planner's edit form. Refuses to overwrite a change made elsewhere since the form was opened. */
export async function updateTask(id: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    const title = text(form.get("title"), 300);
    if (!title) throw new ValidationError("Add a title.");
    const status = oneOf(form.get("status"), ["todo", "doing", "waiting", "done", "cancelled"] as const, "todo")!;
    const waitingOn = status === "waiting" ? uuidOrNull(form.get("waitingOnTaskId")) : null;
    if (waitingOn === id) throw new ValidationError("A task can't wait on itself.");
    expectRow(await tx`
      update public.tasks set
        title = ${title},
        status = ${status},
        priority = ${oneOf(form.get("priority"), ["high", "normal", "low"] as const, "normal")},
        remind_until_done = ${form.get("remindUntilDone") === "on"},
        due_date = ${dateOrNull(form.get("dueDate"))},
        notes = ${text(form.get("notes"), 5000)},
        manuscript_id = ${await publicationOrNull(tx, form.get("manuscriptId"))},
        waiting_reason = ${status === "waiting" ? text(form.get("waitingReason"), 300) : null},
        waiting_on_task_id = ${waitingOn},
        completed_at = case when ${status} in ('done', 'cancelled') then coalesce(completed_at, now()) else null end,
        version = version + 1
      where id = ${id} and version = ${version} and deleted_at is null
      returning id`);
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
