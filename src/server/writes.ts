import "server-only";
import type { Tx } from "@/server/db";
import { ValidationError, oneOf, uuidOrNull, dateOrNull } from "@/server/validate";
import { isFuture, type PartialDate } from "@/lib/dates";
import { categories, phases, type TaskPriority } from "@/lib/labels";

/**
 * The database work behind adding and changing records, shared by the app's server actions
 * and the ChatGPT / Codex connector so both follow exactly the same rules.
 * Every function runs inside `withUser`, so row-level security applies.
 */

export const CATEGORY_KEYS = Object.keys(categories) as (keyof typeof categories)[];
export const PHASE_KEYS = Object.keys(phases) as (keyof typeof phases)[];
export const TASK_STATUSES = ["todo", "doing", "waiting", "done", "cancelled"] as const;
export const PARENT_TYPES = ["entry", "project", "manuscript", "course", "milestone", "trial"] as const;
export type ParentType = (typeof PARENT_TYPES)[number];

export function kindFor(category: string | null) {
  if (category === "experiment") return "experiment";
  if (category === "conference" || category === "training" || category === "competition") return "event";
  if (category === "guide_meeting") return "meeting";
  if (category === "decision") return "decision";
  return "note";
}

export function checkPartial(d: PartialDate): PartialDate {
  if (d.precision === "none") return { date: null, precision: "none" };
  if (d.precision === "day" && dateOrNull(d.date)) return d;
  if (d.precision === "month" && typeof d.date === "string" && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(d.date)) return d;
  throw new ValidationError("That date isn't valid.");
}

export function cleanTitle(v: unknown) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new ValidationError("Add a title.");
  if (s.length > 300) throw new ValidationError("Please keep the title under 300 characters.");
  return s;
}

export function cleanText(v: unknown, max = 20000) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s.length > max) throw new ValidationError(`Please keep this under ${max} characters.`);
  return s || null;
}

/** A publication to tag something with: must exist and not be in Trash. */
export async function publicationOrNull(tx: Tx, value: unknown): Promise<string | null> {
  const id = uuidOrNull(value);
  if (!id) return null;
  const [m] = await tx`select 1 from public.manuscripts where id = ${id} and deleted_at is null`;
  if (!m) throw new ValidationError("That publication wasn't found — it may be in Trash.");
  return id;
}

// ---------------------------------------------------------------- journal entries

export type NewEntryInput = {
  id: string; // chosen by the caller so a retry can't create a duplicate
  title: string;
  date: PartialDate;
  category: string | null;
  /** The publication it's about, if any (the PhD itself is the only project). */
  manuscriptId?: string | null;
  notes: string | null;
  people: string | null;
  planned: boolean;
};

/** `today` is in her time zone; a future date is only "Planned" when that was asked for. */
export async function insertEntry(tx: Tx, input: NewEntryInput, today: string) {
  const id = uuidOrNull(input.id);
  if (!id) throw new ValidationError("Something went wrong — please try again.");
  const title = cleanTitle(input.title);
  const date = checkPartial(input.date);
  const category = oneOf(input.category, CATEGORY_KEYS);
  const kind = kindFor(category);
  const status = input.planned && isFuture(date.date, date.precision, today) ? "planned" : null;

  const [row] = await tx`
    insert into public.entries (id, title, kind, category, entry_date, entry_precision, status, description, people, manuscript_id)
    values (${id}, ${title}, ${kind}, ${category}, ${date.date}, ${date.precision}, ${status},
            ${cleanText(input.notes)}, ${cleanText(input.people, 500)}, ${await publicationOrNull(tx, input.manuscriptId)})
    on conflict (id) do nothing
    returning id`;
  if (row) {
    if (kind === "experiment") await tx`insert into public.experiments (entry_id) values (${id})`;
    if (kind === "event") await tx`insert into public.events (entry_id) values (${id})`;
  }
  return { id, kind, status };
}

// ---------------------------------------------------------------- tasks

export type NewTaskInput = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  notes: string | null;
  remindUntilDone?: boolean;
  originEntryId?: string | null;
  manuscriptId?: string | null;
};

export async function insertTask(tx: Tx, input: NewTaskInput) {
  const id = uuidOrNull(input.id);
  if (!id) throw new ValidationError("Something went wrong — please try again.");
  const title = cleanTitle(input.title);

  // A task keeps its origin; its publication comes from what was chosen, else from the entry it came from.
  let manuscriptId = await publicationOrNull(tx, input.manuscriptId);
  const originEntryId = uuidOrNull(input.originEntryId);
  if (originEntryId && !manuscriptId) {
    const [origin] = await tx<{ manuscriptId: string | null }[]>`select manuscript_id from public.entries where id = ${originEntryId}`;
    manuscriptId = origin?.manuscriptId ?? null;
  }
  await tx`
    insert into public.tasks (id, title, due_date, priority, notes, origin_entry_id, manuscript_id, remind_until_done)
    values (${id}, ${title}, ${dateOrNull(input.dueDate)}, ${oneOf(input.priority, ["high", "normal", "low"] as const, "normal")},
            ${cleanText(input.notes, 5000)}, ${originEntryId}, ${manuscriptId}, ${input.remindUntilDone === true})
    on conflict (id) do nothing`;
  return { id };
}

/** Change a task's status. "waiting" keeps a reason (and optionally the task it waits on). */
export async function setTaskStatus(
  tx: Tx,
  id: string,
  status: (typeof TASK_STATUSES)[number],
  opts: { waitingReason?: string | null; waitingOnTaskId?: string | null } = {},
) {
  const s = oneOf(status, TASK_STATUSES);
  if (!s) throw new ValidationError("Choose a status: to do, doing, waiting, done or cancelled.");
  const waitingOn = s === "waiting" ? uuidOrNull(opts.waitingOnTaskId) : null;
  if (waitingOn === id) throw new ValidationError("A task can't wait on itself.");
  const [row] = await tx<{ id: string; title: string; status: string }[]>`
    update public.tasks set
      status = ${s},
      waiting_reason = ${s === "waiting" ? cleanText(opts.waitingReason, 300) : null},
      waiting_on_task_id = ${waitingOn},
      completed_at = case when ${s} in ('done', 'cancelled') then coalesce(completed_at, now()) else null end,
      version = version + 1
    where id = ${id} and deleted_at is null
    returning id, title, status`;
  if (!row) throw new ValidationError("Task not found.");
  return row;
}

// ---------------------------------------------------------------- evidence

const PARENT_TABLE: Record<ParentType, string> = {
  entry: "public.entries",
  project: "public.projects",
  manuscript: "public.manuscripts",
  course: "public.courses",
  milestone: "public.milestones",
  trial: "public.experiment_trials",
};

/** Is there a record of this type and id that she can see (and that isn't in Trash)? */
export async function parentExists(tx: Tx, parentType: ParentType, parentId: string) {
  const id = uuidOrNull(parentId);
  if (!id || !(parentType in PARENT_TABLE)) return false;
  if (parentType === "trial") {
    // a removed trial, or a trial of an experiment in Trash, is out of reach like the experiment itself
    const [t] = await tx`
      select 1 from public.experiment_trials t join public.entries e on e.id = t.entry_id
      where t.id = ${id} and t.removed_at is null and e.deleted_at is null`;
    return Boolean(t);
  }
  const softDelete = parentType === "entry" || parentType === "project" || parentType === "manuscript" || parentType === "course";
  const [row] = await tx`
    select 1 from ${tx.unsafe(PARENT_TABLE[parentType])} where id = ${id} ${softDelete ? tx`and deleted_at is null` : tx``}`;
  return Boolean(row);
}

/**
 * A link as evidence on a record. With `id` (the connector's request_id), a repeated call
 * finds the first call's link instead of adding another; an id taken by a record she can't
 * see is refused.
 */
export async function insertLink(tx: Tx, parentType: ParentType, parentId: string, url: string, label: string | null, id?: string) {
  const u = String(url ?? "").trim();
  if (!/^https?:\/\/\S+$/i.test(u) || u.length > 2000) throw new ValidationError("Paste a full link starting with https://");
  if (!(await parentExists(tx, parentType, parentId))) throw new ValidationError("That record wasn't found.");
  const [row] = await tx<{ id: string }[]>`
    insert into public.attachments (id, parent_type, parent_id, kind, url, label)
    values (${id ?? crypto.randomUUID()}, ${parentType}, ${parentId}, 'link', ${u}, ${cleanText(label, 200)})
    on conflict (id) do nothing
    returning id`;
  if (row) return row;
  await mustBeVisible(tx, "attachments", id!);
  return { id: id!, repeated: true as const };
}

/** After `on conflict (id) do nothing` skipped an insert: the existing row must be hers. */
async function mustBeVisible(tx: Tx, table: "attachments" | "entries", id: string) {
  const [seen] = await tx`select 1 from ${tx("public." + table)} where id = ${id}`;
  if (!seen) throw new ValidationError("That request_id is already in use. Send a new one.");
}

// ---------------------------------------------------------------- manuscripts

/**
 * Guide feedback: one entry, its requested changes, and (optionally) one linked task per change.
 * With `id` (the connector's request_id) as the entry's id, a repeated call returns the first
 * call's entry and tasks instead of adding them again.
 */
export async function insertFeedback(
  tx: Tx,
  manuscriptId: string,
  input: { source: string | null; via: string | null; changes: string | null; date: PartialDate; makeTasks: boolean },
  id?: string,
) {
  const [m] = await tx<{ title: string }[]>`
    select title from public.manuscripts where id = ${uuidOrNull(manuscriptId)} and deleted_at is null`;
  if (!m) throw new ValidationError("Manuscript not found.");
  const source = cleanText(input.source, 200);
  const changes = cleanText(input.changes, 20000);
  const date = checkPartial(input.date);
  const [e] = await tx<{ id: string }[]>`
    insert into public.entries (id, title, kind, category, entry_date, entry_precision, manuscript_id, people)
    values (${id ?? crypto.randomUUID()}, ${`Feedback on ${m.title}`}, 'feedback', 'guide_meeting', ${date.date}, ${date.precision}, ${manuscriptId}, ${source})
    on conflict (id) do nothing
    returning id`;
  if (!e) {
    await mustBeVisible(tx, "entries", id!);
    const earlier = await tx<{ id: string }[]>`select id from public.tasks where origin_entry_id = ${id!} order by created_at`;
    return { entryId: id!, taskIds: earlier.map((t) => t.id), repeated: true as const };
  }
  await tx`
    insert into public.feedback (entry_id, manuscript_id, source, received_via, requested_changes)
    values (${e.id}, ${manuscriptId}, ${source}, ${cleanText(input.via, 200)}, ${changes})`;
  const taskIds: string[] = [];
  if (input.makeTasks) {
    const lines = (changes ?? "").split("\n").map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
    for (const line of lines.slice(0, 30)) {
      const [t] = await tx<{ id: string }[]>`
        insert into public.tasks (title, origin_entry_id, manuscript_id)
        values (${line.slice(0, 300)}, ${e.id}, ${manuscriptId}) returning id`;
      taskIds.push(t.id);
    }
  }
  return { entryId: e.id, taskIds };
}

/**
 * kind 'change' moves the current phase; 'earlier_change' only adds history,
 * so recording the past never resets where the manuscript is now.
 */
export async function insertPhaseEvent(
  tx: Tx,
  manuscriptId: string,
  input: { kind: "change" | "earlier_change"; phase: string | null; date: PartialDate; note: string | null; stoppedReason?: string | null },
) {
  const phase = oneOf(input.phase, PHASE_KEYS);
  if (!phase) throw new ValidationError("Choose a phase.");
  const date = checkPartial(input.date);
  if (input.kind === "earlier_change" && date.precision === "none") {
    throw new ValidationError("Add when it happened — a month is enough.");
  }
  const [m] = await tx`select 1 from public.manuscripts where id = ${uuidOrNull(manuscriptId)} and deleted_at is null`;
  if (!m) throw new ValidationError("Manuscript not found.");
  await tx`
    insert into public.manuscript_phase_events (manuscript_id, phase, effective_date, effective_precision, kind, note)
    values (${manuscriptId}, ${phase}, ${date.date}, ${date.precision}, ${input.kind}, ${cleanText(input.note, 1000)})`;
  if (input.kind === "change" && phase === "stopped") {
    await tx`update public.manuscripts set stopped_reason = ${oneOf(input.stoppedReason, ["withdrawn", "abandoned"] as const)} where id = ${manuscriptId}`;
  }
  return { phase };
}

// ---------------------------------------------------------------- scholar feedback (Nov 2026)

/** A course's assignment, exam registration or exam. With `id`, a repeat finds the first add. */
export async function insertCourseItem(
  tx: Tx,
  input: { id?: string; courseId: string; kind: "assignment" | "exam_registration" | "exam"; title: string | null; dueDate: string | null },
) {
  const kind = oneOf(input.kind, ["assignment", "exam_registration", "exam"] as const, "assignment")!;
  const title = cleanText(input.title, 200) ?? (kind === "exam_registration" ? "Exam registration" : kind === "exam" ? "Exam" : null);
  if (!title) throw new ValidationError("Name the assignment, e.g. Week 3 assignment.");
  const [c] = await tx`select 1 from public.courses where id = ${uuidOrNull(input.courseId)} and deleted_at is null`;
  if (!c) throw new ValidationError("That course wasn't found.");
  const id = uuidOrNull(input.id) ?? crypto.randomUUID();
  await tx`
    insert into public.course_items (id, course_id, kind, title, due_date)
    values (${id}, ${input.courseId}, ${kind}, ${title}, ${dateOrNull(input.dueDate)})
    on conflict (id) do nothing`;
  return { id };
}

/** The next trial of an experiment; it starts with the last trial's conditions unless given its own. */
export async function insertTrial(
  tx: Tx,
  input: { id?: string; entryId: string; runOn?: string | null; conditions?: string | null; result?: string | null; outcome?: string | null },
) {
  const entryId = uuidOrNull(input.entryId);
  // locking the experiment numbers its trials in order, even when two are added at once
  const [x] = await tx`select 1 from public.entries where id = ${entryId} and kind = 'experiment' and deleted_at is null for update`;
  if (!x) throw new ValidationError("That experiment wasn't found.");
  const [{ next }] = await tx<{ next: number }[]>`
    select coalesce(max(trial_no), 0) + 1 as next from public.experiment_trials where entry_id = ${entryId}`;
  const [last] = await tx<{ conditions: string | null }[]>`
    select conditions from public.experiment_trials where entry_id = ${entryId} and removed_at is null order by trial_no desc limit 1`;
  const id = uuidOrNull(input.id) ?? crypto.randomUUID();
  await tx`
    insert into public.experiment_trials (id, entry_id, trial_no, run_on, conditions, result, outcome)
    values (${id}, ${entryId}, ${next}, ${dateOrNull(input.runOn) ?? tx`app.user_today()`},
            ${input.conditions === undefined ? (last?.conditions ?? null) : cleanText(input.conditions, 5000)},
            ${cleanText(input.result, 10000)}, ${oneOf(input.outcome, ["worked", "did_not_work", "inconclusive"] as const)})
    on conflict (id) do nothing`;
  return { id };
}

/** A scratch note or a checklist (items as plain text, not ticked). */
export async function insertNote(
  tx: Tx,
  input: { id?: string; kind: "scratch" | "checklist"; title?: string | null; body?: string | null; items?: string[]; manuscriptId?: string | null },
) {
  const kind = oneOf(input.kind, ["scratch", "checklist"] as const, "scratch")!;
  const title = cleanText(input.title, 300) ?? (kind === "checklist" ? "New checklist" : "Untitled note");
  const items = (input.items ?? []).map((t) => String(t).trim().slice(0, 1000)).filter(Boolean).slice(0, 500)
    .map((text) => ({ id: crypto.randomUUID().slice(0, 8), text, done: false }));
  const manuscriptId = await publicationOrNull(tx, input.manuscriptId);
  const id = uuidOrNull(input.id) ?? crypto.randomUUID();
  await tx`
    insert into public.notes (id, kind, title, body, items, manuscript_id)
    values (${id}, ${kind}, ${title}, ${cleanText(input.body, 100000)}, ${tx.json(items)}, ${manuscriptId})
    on conflict (id) do nothing`;
  return { id };
}

/**
 * Change a review step: status (done gets today unless a date is given), its PRISMA number, a note.
 * Fields left out stay as they are.
 */
export async function setReviewStep(
  tx: Tx,
  input: { stepId: string; status?: string; doneOn?: string | null; count?: number | null; note?: string | null },
) {
  const fields: Record<string, unknown> = {};
  if (input.status !== undefined) {
    const status = oneOf(input.status, ["not_started", "in_progress", "done", "skipped"] as const);
    if (!status) throw new ValidationError("Status must be not_started, in_progress, done or skipped.");
    fields.status = status;
    if (status !== "done") fields.done_on = null;
  }
  if (input.doneOn !== undefined) fields.done_on = dateOrNull(input.doneOn);
  if (input.count !== undefined) {
    if (input.count !== null && (!Number.isInteger(input.count) || input.count < 0)) throw new ValidationError("The count must be a whole number.");
    fields.count = input.count;
  }
  if (input.note !== undefined) fields.note = cleanText(input.note, 5000);
  const stepId = uuidOrNull(input.stepId);
  const [current] = await tx<{ doneOn: string | null; today: string }[]>`
    select done_on, app.user_today() as today from public.review_steps
    where id = ${stepId} and removed_at is null and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.deleted_at is null)`;
  if (!current) throw new ValidationError("That review step wasn't found.");
  // done without a date: keep the date it already had, else today
  if (fields.status === "done" && fields.done_on === undefined) fields.done_on = current.doneOn ?? current.today;
  // (postgres.js reads an object as "column = value" pairs only directly after SET)
  const [row] = Object.keys(fields).length
    ? await tx<{ id: string; title: string; status: string; doneOn: string | null; count: number | null; manuscriptId: string }[]>`
        update public.review_steps set ${tx(fields)}, version = version + 1
        where id = ${stepId} and removed_at is null
        returning id, title, status, done_on, count, manuscript_id`
    : await tx<{ id: string; title: string; status: string; doneOn: string | null; count: number | null; manuscriptId: string }[]>`
        select id, title, status, done_on, count, manuscript_id from public.review_steps where id = ${stepId} and removed_at is null`;
  if (!row) throw new ValidationError("That review step wasn't found.");
  return row;
}
