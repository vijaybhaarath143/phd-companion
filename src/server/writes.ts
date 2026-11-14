import "server-only";
import type { Tx } from "@/server/db";
import { ValidationError, oneOf, uuidOrNull, dateOrNull } from "@/server/validate";
import { isFuture, type PartialDate } from "@/lib/dates";
import { categories, phases } from "@/lib/labels";

/**
 * The database work behind adding and changing records, shared by the app's server actions
 * and the ChatGPT / Codex connector so both follow exactly the same rules.
 * Every function runs inside `withUser`, so row-level security applies.
 */

export const CATEGORY_KEYS = Object.keys(categories) as (keyof typeof categories)[];
export const PHASE_KEYS = Object.keys(phases) as (keyof typeof phases)[];
export const TASK_STATUSES = ["todo", "doing", "waiting", "done", "cancelled"] as const;
export const PARENT_TYPES = ["entry", "project", "manuscript", "course", "milestone"] as const;
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

// ---------------------------------------------------------------- journal entries

export type NewEntryInput = {
  id: string; // chosen by the caller so a retry can't create a duplicate
  title: string;
  date: PartialDate;
  category: string | null;
  projectId: string | null;
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
    insert into public.entries (id, title, kind, category, entry_date, entry_precision, status, description, people, project_id)
    values (${id}, ${title}, ${kind}, ${category}, ${date.date}, ${date.precision}, ${status},
            ${cleanText(input.notes)}, ${cleanText(input.people, 500)}, ${uuidOrNull(input.projectId)})
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
  priority: "normal" | "important";
  projectId: string | null;
  notes: string | null;
  originEntryId?: string | null;
  manuscriptId?: string | null;
};

export async function insertTask(tx: Tx, input: NewTaskInput) {
  const id = uuidOrNull(input.id);
  if (!id) throw new ValidationError("Something went wrong — please try again.");
  const title = cleanTitle(input.title);

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
            ${projectId}, ${cleanText(input.notes, 5000)}, ${originEntryId}, ${uuidOrNull(input.manuscriptId)})
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
};

/** Is there a record of this type and id that she can see (and that isn't in Trash)? */
export async function parentExists(tx: Tx, parentType: ParentType, parentId: string) {
  const id = uuidOrNull(parentId);
  if (!id || !(parentType in PARENT_TABLE)) return false;
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
  const [m] = await tx<{ title: string; projectId: string | null }[]>`
    select title, project_id from public.manuscripts where id = ${uuidOrNull(manuscriptId)} and deleted_at is null`;
  if (!m) throw new ValidationError("Manuscript not found.");
  const source = cleanText(input.source, 200);
  const changes = cleanText(input.changes, 20000);
  const date = checkPartial(input.date);
  const [e] = await tx<{ id: string }[]>`
    insert into public.entries (id, title, kind, category, entry_date, entry_precision, project_id, people)
    values (${id ?? crypto.randomUUID()}, ${`Feedback on ${m.title}`}, 'feedback', 'guide_meeting', ${date.date}, ${date.precision}, ${m.projectId}, ${source})
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
        insert into public.tasks (title, project_id, origin_entry_id, manuscript_id)
        values (${line.slice(0, 300)}, ${m.projectId}, ${e.id}, ${manuscriptId}) returning id`;
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
