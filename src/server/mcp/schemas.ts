import { z } from "zod";
import type { PartialDate } from "@/lib/dates";
import { categories, phases } from "@/lib/labels";
import { TIMELINE_TYPES } from "@/server/timeline";

/**
 * Inputs for every connector tool, with descriptions written for the assistant.
 * Kept apart from the handlers so they can be tested on their own.
 */

const id = (what: string) => z.string().uuid(`That isn't a valid ${what} id.`).describe(`The ${what}'s id (from a list or search result).`);

/** "2026-11-14" (day known), "2026-11" (only the month known), or nothing (no date yet). */
export const partialDate = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, "Use YYYY-MM-DD, or YYYY-MM when only the month is known.")
  .refine((s) => s.length === 7 || isRealDay(s), "That day doesn't exist in that month.");

function isRealDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Turn the connector's date text into the app's partial date. Never invents a day. */
export function toPartialDate(s: string | null | undefined): PartialDate {
  if (!s) return { date: null, precision: "none" };
  if (s.length === 7) return { date: `${s}-01`, precision: "month" };
  return { date: s, precision: "day" };
}

const dateHelp =
  "When it happened or will happen: YYYY-MM-DD if the day is known, YYYY-MM if only the month is known. Leave out if unknown — never guess a day.";

const recordType = z
  .enum(["entry", "project", "manuscript", "course", "milestone"])
  .describe("What kind of record: entry (journal entry, experiment or feedback), project, manuscript, course or milestone.");

const categoryKeys = Object.keys(categories) as [keyof typeof categories, ...(keyof typeof categories)[]];
const timelineTypes = Object.keys(TIMELINE_TYPES) as [keyof typeof TIMELINE_TYPES, ...(keyof typeof TIMELINE_TYPES)[]];
const phaseKeys = Object.keys(phases) as [keyof typeof phases, ...(keyof typeof phases)[]];

/**
 * Makes an add safe to retry: the same request_id never adds a second record. It becomes the
 * new record's id, and a repeat call returns the record the first call added.
 */
const requestId = z
  .string()
  .uuid("request_id must be a UUID.")
  .optional()
  .describe("Optional: a new random UUID for this add. If the call is retried (e.g. after a timeout) with the same request_id, nothing is added twice — the earlier record is returned.");

/**
 * The most base64 text add_file takes: Vercel accepts request bodies up to 4.5 MB, and base64
 * is a third bigger than the file, so files of about 3 MB fit.
 */
export const MAX_BASE64_CHARS = 4_400_000;

export const schemas = {
  search: {
    query: z.string().trim().min(2, "Search for at least 2 characters.").max(200).describe("Words to look for, e.g. a person, method, journal or topic."),
    limit: z.number().int().min(1).max(50).optional().describe("Most journal entries to return (default 20)."),
  },
  get_home_summary: {},
  list_journal_entries: {
    query: z.string().trim().max(200).optional().describe("Only entries mentioning these words."),
    category: z.enum(categoryKeys).optional().describe("Only this kind of entry."),
    project_id: id("project").optional(),
    from_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.").optional().describe("Only entries from this month on (YYYY-MM)."),
    to_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.").optional().describe("Only entries up to the end of this month (YYYY-MM)."),
    limit: z.number().int().min(1).max(200).optional().describe("Most dated entries to return, newest first (default 50)."),
  },
  get_journal_entry: { entry_id: id("journal entry") },
  list_projects: {},
  get_project: { project_id: id("project") },
  list_manuscripts: { project_id: id("project").optional().describe("Only manuscripts in this project.") },
  get_manuscript: { manuscript_id: id("manuscript") },
  list_experiments: { project_id: id("project").optional().describe("Only experiments in this project.") },
  get_experiment: { experiment_id: id("experiment") },
  list_tasks: {
    show: z.enum(["open", "waiting", "done"]).optional().describe("open (default: to do, doing and waiting), waiting only, or done (done and cancelled)."),
  },
  list_goals: {},
  get_academics: {},
  get_timeline: {
    type: z.enum(timelineTypes).optional().describe("Only one kind of thing: " + Object.entries(TIMELINE_TYPES).map(([k, v]) => `${k} (${v})`).join(", ") + "."),
    project_id: id("project").optional().describe("Only things belonging to this project."),
    period: z.enum(["month", "year", "all"]).optional().describe("this month, this year, or all (default) — 'all' also lists things with no date yet."),
    limit: z.number().int().min(1).max(300).optional().describe("Most dated items to return, newest first (default 100)."),
    before: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
      .refine(isRealDay, "That day doesn't exist.")
      .optional()
      .describe("Only items dated before this day (YYYY-MM-DD), to read further back: pass next_before from the previous result."),
  },
  list_files_and_links: { record_type: recordType, record_id: id("record") },
  read_file_text: {
    file_id: id("file"),
    start: z.number().int().min(0).optional().describe("Character to start from, to read a long file in parts (use next_start from the previous result)."),
  },

  create_journal_entry: {
    title: z.string().trim().min(1, "Add a title.").max(300),
    date: partialDate.optional().describe(dateHelp),
    category: z.enum(categoryKeys).optional().describe("What kind of entry this is."),
    project_id: id("project").optional().describe("The project it belongs to, if any."),
    notes: z.string().max(20000).optional().describe("What happened, in her words."),
    people: z.string().max(500).optional().describe("People involved, e.g. her guide."),
    planned: z.boolean().optional().describe("True if this is something planned for a future date (marks it Planned)."),
    request_id: requestId,
  },
  create_task: {
    title: z.string().trim().min(1, "Add a title.").max(300),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(isRealDay, "That day doesn't exist.").optional().describe("Due date, YYYY-MM-DD."),
    priority: z.enum(["high", "normal", "low", "important"]).optional().describe("high, normal (default) or low. \"important\" is read as high."),
    remind_until_done: z.boolean().optional().describe("True to keep a reminder banner on every page until the task is done."),
    project_id: id("project").optional(),
    manuscript_id: id("manuscript").optional(),
    from_entry_id: id("journal entry").optional().describe("The journal entry this task came out of, if any."),
    notes: z.string().max(5000).optional(),
    request_id: requestId,
  },
  update_task_status: {
    task_id: id("task"),
    status: z.enum(["todo", "doing", "waiting", "done", "cancelled"]).describe("todo = to do, doing, waiting (blocked on someone or something), done, cancelled."),
    waiting_reason: z.string().trim().max(300).optional().describe("Required when status is waiting: what or who it is waiting for."),
    waiting_on_task_id: id("task").optional().describe("When waiting on another of her tasks, that task's id."),
  },
  add_link: {
    record_type: recordType,
    record_id: id("record"),
    url: z.string().trim().url("Give a full link starting with https://").max(2000).refine((u) => /^https?:\/\//i.test(u), "Links must start with https:// or http://"),
    label: z.string().trim().max(200).optional().describe("A short name for the link."),
    request_id: requestId,
  },
  add_guide_feedback: {
    manuscript_id: id("manuscript"),
    requested_changes: z.string().trim().min(1, "Add what was asked for.").max(20000).describe("What the guide asked to change. One change per line if there are several."),
    from: z.string().trim().max(200).optional().describe("Who gave the feedback (default: her guide)."),
    received_via: z.string().trim().max(200).optional().describe("How it came, e.g. meeting, email, comments on the draft."),
    received_date: partialDate.optional().describe(dateHelp),
    make_tasks: z.boolean().optional().describe("Also create one task per line of requested changes (default false)."),
    request_id: requestId,
  },
  move_manuscript_to_phase: {
    manuscript_id: id("manuscript"),
    phase: z.enum(phaseKeys).describe("The phase to record."),
    date: partialDate.optional().describe(dateHelp),
    note: z.string().trim().max(1000).optional(),
    history_only: z.boolean().optional().describe("True to record an earlier phase change for the history without moving the manuscript's current phase (needs a date)."),
    stopped_reason: z.enum(["withdrawn", "abandoned"]).optional().describe("Only when the phase is stopped."),
  },
  add_file: {
    record_type: recordType,
    record_id: id("record"),
    filename: z.string().trim().min(1).max(200).describe("File name with its extension: pdf, png, jpg, webp, gif, heic, docx, xlsx, pptx, csv or txt."),
    content_base64: z
      .string()
      .min(1, "content_base64 is empty.")
      .max(MAX_BASE64_CHARS, "That file is too big to send here (about 3 MB at most, the request size limit). Ask her to upload it in the app, or add a link to it instead.")
      .describe("The file's bytes, base64-encoded. At most about 3 MB of file (4,400,000 base64 characters)."),
    label: z.string().trim().max(200).optional().describe("A short name to show instead of the file name."),
    request_id: requestId,
  },
  move_to_trash: {
    record_type: z.enum(["entry", "task"]).describe("entry (journal entry, experiment or feedback) or task."),
    record_id: id("record"),
  },
  update_review_step: {
    step_id: id("review step").describe("The review step's id (from get_project's review_steps)."),
    status: z.enum(["not_started", "in_progress", "done", "skipped"]).optional().describe("Where the step stands. done records today unless done_on is given."),
    done_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(isRealDay, "That day doesn't exist.").optional().describe("When it was done, YYYY-MM-DD."),
    count: z.number().int().min(0).max(10_000_000).nullable().optional().describe("The PRISMA number this step records (see the step's count_kind), e.g. records identified. null clears it."),
    note: z.string().max(5000).optional().describe("A note on the step, e.g. which databases were searched. Replaces the current note."),
  },
  add_course_deadline: {
    course_id: id("course").describe("The course's id (from get_academics)."),
    kind: z.enum(["assignment", "exam_registration", "exam"]).describe("assignment, exam_registration (the deadline to register) or exam."),
    title: z.string().trim().max(200).optional().describe("e.g. Week 3 assignment. Optional for exam registration and exam."),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(isRealDay, "That day doesn't exist.").optional().describe("Due date, YYYY-MM-DD. Leave out if not known."),
    request_id: requestId,
  },
  add_trial: {
    experiment_id: id("experiment"),
    run_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.").refine(isRealDay, "That day doesn't exist.").optional().describe("When this run was done, YYYY-MM-DD. Defaults to today."),
    conditions: z.string().max(5000).optional().describe("What was different in this run. Left out: the last trial's conditions are copied."),
    result: z.string().max(10000).optional().describe("What she observed or measured."),
    outcome: z.enum(["worked", "did_not_work", "inconclusive"]).optional(),
    request_id: requestId,
  },
  list_notes: {},
  get_note: { note_id: id("note").describe("The note's id (from list_notes or search).") },
  create_note: {
    kind: z.enum(["scratch", "checklist"]).describe("scratch (free text) or checklist (items to tick off)."),
    title: z.string().trim().max(300).optional(),
    body: z.string().max(100000).optional().describe("The note's text (for a checklist: notes under the list)."),
    items: z.array(z.string().trim().min(1).max(1000)).max(500).optional().describe("Checklist items, not ticked yet."),
    project_id: id("project").optional(),
    request_id: requestId,
  },
} satisfies Record<string, z.ZodRawShape>;

export type ToolName = keyof typeof schemas;
export type ToolInput<N extends ToolName> = z.infer<z.ZodObject<(typeof schemas)[N]>>;

/** Decode a base64 file body strictly (an optional data: URL prefix and line breaks are fine). */
export function decodeBase64(s: string): Uint8Array | null {
  const body = s.replace(/^data:[^;,]*;base64,/, "").replace(/\s+/g, "");
  if (!body || body.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  return new Uint8Array(Buffer.from(body, "base64"));
}
