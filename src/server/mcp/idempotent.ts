import "server-only";
import type { Tx } from "@/server/db";
import { ValidationError } from "@/server/validate";
import { insertFeedback, insertLink, type ParentType } from "@/server/writes";
import type { PartialDate } from "@/lib/dates";

/**
 * Retry-safe adds for the connector. An assistant may resend a call after a timeout; when it
 * sends the same `request_id`, that id is used as the new record's id, so the second call finds
 * the first call's record instead of adding another one.
 *
 * Every insert in writes.ts (entries, tasks, links, feedback) takes an optional id and skips
 * a duplicate, so the app and the connector share one set of rules.
 */

/** Which table a request_id lives in, for finding an earlier add. */
const TABLE = {
  entry: "public.entries",
  task: "public.tasks",
  attachment: "public.attachments",
  course_item: "public.course_items",
  trial: "public.experiment_trials",
  note: "public.notes",
} as const;

/** Is there already a record with this id that she can see? */
export async function alreadyAdded(tx: Tx, table: keyof typeof TABLE, id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const [row] = await tx`select 1 from ${tx.unsafe(TABLE[table])} where id = ${id}`;
  return Boolean(row);
}

/**
 * After an insert that skips duplicates (`on conflict (id) do nothing`): make sure the record
 * really is hers. An id taken by someone else's record is invisible to her, so it is refused.
 */
export async function confirmAdded(tx: Tx, table: keyof typeof TABLE, id: string) {
  if (!(await alreadyAdded(tx, table, id))) throw new ValidationError("That request_id is already in use. Send a new one.");
}

/** insertLink with the connector's request_id as the link's id (see writes.ts). */
export async function insertLinkWithId(tx: Tx, id: string | undefined, parentType: ParentType, parentId: string, url: string, label: string | null) {
  return insertLink(tx, parentType, parentId, url, label, id);
}

/** insertFeedback with the connector's request_id as the feedback entry's id (see writes.ts). */
export async function insertFeedbackWithId(
  tx: Tx,
  id: string | undefined,
  manuscriptId: string,
  input: { source: string | null; via: string | null; changes: string | null; date: PartialDate; makeTasks: boolean },
) {
  return insertFeedback(tx, manuscriptId, input, id);
}

/** Tasks made from a feedback entry (for repeating an earlier add_guide_feedback answer). */
export async function tasksFrom(tx: Tx, entryId: string) {
  const rows = await tx<{ id: string }[]>`select id from public.tasks where origin_entry_id = ${entryId} order by created_at`;
  return rows.map((r) => r.id);
}
