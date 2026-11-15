"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError } from "@/server/db";
import { run, ValidationError, oneOf, uuidOrNull } from "@/server/actions/run";
import { insertNote, publicationOrNull } from "@/server/writes";

export async function createNote(kind: "scratch" | "checklist") {
  const r = await run(async (tx) => {
    const { id } = await insertNote(tx, { kind: oneOf(kind, ["scratch", "checklist"] as const, "scratch")! });
    return id;
  });
  if (r.ok) redirect(`/notes?id=${r.data}`);
  return r;
}

export type NotePatch = {
  title?: string;
  body?: string;
  items?: { id: string; text: string; done: boolean }[];
  manuscriptId?: string | null;
  pinned?: boolean;
};

/** Autosave: only what changed, refused if the note changed elsewhere since it was opened. */
export async function saveNote(id: string, expectedVersion: number, patch: NotePatch) {
  return run(async (tx) => {
    const fields: Record<string, unknown> = {};
    if (patch.title !== undefined) fields.title = String(patch.title).slice(0, 300).trim() || "Untitled";
    if (patch.body !== undefined) {
      const body = String(patch.body);
      if (body.length > 100000) throw new ValidationError("This note is too long — split it into two.");
      fields.body = body || null;
    }
    if (patch.items !== undefined) {
      if (!Array.isArray(patch.items) || patch.items.length > 500) throw new ValidationError("Keep a checklist under 500 items.");
      fields.items = tx.json(
        patch.items.map((i) => ({ id: String(i.id).slice(0, 40), text: String(i.text ?? "").slice(0, 1000), done: i.done === true })),
      );
    }
    if (patch.manuscriptId !== undefined) fields.manuscript_id = await publicationOrNull(tx, patch.manuscriptId);
    if (patch.pinned !== undefined) fields.pinned = patch.pinned === true;
    const [row] = Object.keys(fields).length
      ? await tx<{ version: number }[]>`
          update public.notes set ${tx(fields)}, version = version + 1
          where id = ${uuidOrNull(id)} and version = ${expectedVersion} and deleted_at is null returning version`
      : await tx<{ version: number }[]>`select version from public.notes where id = ${uuidOrNull(id)} and version = ${expectedVersion} and deleted_at is null`;
    if (!row) throw new ConflictError();
    refresh();
    return { version: row.version };
  });
}

export async function trashNote(id: string) {
  const r = await run(async (tx) => {
    const [row] = await tx`update public.notes set deleted_at = now(), version = version + 1 where id = ${uuidOrNull(id)} and deleted_at is null returning id`;
    if (!row) throw new ValidationError("That note wasn't found — it may already be in Trash.");
  });
  if (r.ok) redirect("/notes");
  return r;
}
