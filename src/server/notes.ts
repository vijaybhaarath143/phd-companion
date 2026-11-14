import "server-only";
import type { Tx } from "@/server/db";
import { isUuid } from "@/lib/utils";

export type NoteItem = { id: string; text: string; done: boolean };
export type NoteSummary = { id: string; kind: "scratch" | "checklist"; title: string; pinned: boolean; updatedAt: Date; itemsTotal: number; itemsDone: number; projectTitle: string | null };
export type Note = { id: string; kind: "scratch" | "checklist"; title: string; body: string | null; items: NoteItem[]; projectId: string | null; pinned: boolean; version: number; updatedAt: Date };

export async function listNotes(tx: Tx) {
  return tx<NoteSummary[]>`
    select n.id, n.kind, n.title, n.pinned, n.updated_at,
      jsonb_array_length(n.items) as items_total,
      (select count(*)::int from jsonb_array_elements(n.items) i where i ->> 'done' = 'true') as items_done,
      p.title as project_title
    from public.notes n left join public.projects p on p.id = n.project_id
    where n.deleted_at is null
    order by n.pinned desc, n.updated_at desc`;
}

/** Every note in full (for the connector), pinned first, at most `limit`. */
export async function listNotesFull(tx: Tx, limit = 50) {
  return tx<(Note & { itemsTotal: number; itemsDone: number })[]>`
    select id, kind, title, body, items, project_id, pinned, version, updated_at,
      jsonb_array_length(items) as items_total,
      (select count(*)::int from jsonb_array_elements(items) i where i ->> 'done' = 'true') as items_done
    from public.notes where deleted_at is null
    order by pinned desc, updated_at desc limit ${limit}`;
}

export async function getNote(tx: Tx, id: string) {
  if (!isUuid(id)) return null;
  const [n] = await tx<Note[]>`
    select id, kind, title, body, items, project_id, pinned, version, updated_at
    from public.notes where id = ${id} and deleted_at is null`;
  return n ?? null;
}
