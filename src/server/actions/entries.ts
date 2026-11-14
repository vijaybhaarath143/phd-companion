"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError } from "@/server/db";
import { run, oneOf, uuidOrNull, dateOrNull } from "@/server/actions/run";
import { getProfile } from "@/server/profile";
import { todayIn, type PartialDate } from "@/lib/dates";
import { CATEGORY_KEYS, checkPartial, cleanText, cleanTitle, insertEntry, insertLink, type NewEntryInput } from "@/server/writes";

export type NewEntry = NewEntryInput;

export async function createEntry(input: NewEntry) {
  return run(async (tx) => {
    const profile = await getProfile(tx);
    const result = await insertEntry(tx, input, todayIn(profile?.timezone ?? "Asia/Kolkata"));
    refresh();
    return { id: result.id, kind: result.kind };
  });
}

const ENTRY_FIELDS = ["title", "category", "status", "description", "people", "outcome", "skillsLearned", "projectId"] as const;
const EVENT_FIELDS = ["organiser", "location", "registration", "participation", "presentationTitle", "award", "submissionOutcome"] as const;
const FEEDBACK_FIELDS = ["source", "receivedVia", "requestedChanges", "resolutionNote"] as const;
const ENQUIRY_FIELDS = ["office", "contact", "response", "followUpDate", "status"] as const;

type Patch = {
  entry?: Partial<Record<(typeof ENTRY_FIELDS)[number], string | null>>;
  event?: Partial<Record<(typeof EVENT_FIELDS)[number], string | null>>;
  feedback?: Partial<Record<(typeof FEEDBACK_FIELDS)[number], string | null>>;
  enquiry?: Partial<Record<(typeof ENQUIRY_FIELDS)[number], string | null>>;
};

function pick<K extends string>(obj: Partial<Record<K, string | null>> | undefined, keys: readonly K[]) {
  const out: Record<string, string | null> = {};
  if (!obj) return out;
  for (const k of keys) if (k in obj) out[k] = cleanText(obj[k]);
  return out;
}

/** Autosave for the Entry page. Rejects stale versions instead of overwriting another tab's changes. */
export async function updateEntry(id: string, expectedVersion: number, patch: Patch) {
  return run(async (tx) => {
    const entry = pick(patch.entry, ENTRY_FIELDS);
    if ("title" in entry) entry.title = cleanTitle(entry.title);
    if ("category" in entry) entry.category = oneOf(entry.category, CATEGORY_KEYS);
    if ("status" in entry) entry.status = oneOf(entry.status, ["planned", "done", "postponed", "cancelled"] as const);
    if ("projectId" in entry) entry.projectId = uuidOrNull(entry.projectId);

    // (postgres.js only reads an object as "column = value" pairs directly after SET,
    //  so the two cases are separate statements rather than a nested fragment)
    const [row] = Object.keys(entry).length
      ? await tx<{ version: number }[]>`
          update public.entries set ${tx(entry)}, version = version + 1
          where id = ${id} and version = ${expectedVersion} and deleted_at is null
          returning version`
      : await tx<{ version: number }[]>`
          update public.entries set version = version + 1
          where id = ${id} and version = ${expectedVersion} and deleted_at is null
          returning version`;
    if (!row) throw new ConflictError();

    const event = pick(patch.event, EVENT_FIELDS);
    if ("registration" in event) event.registration = oneOf(event.registration, ["interested", "registered", "not_registered"] as const);
    if ("participation" in event) event.participation = oneOf(event.participation, ["unknown", "attended", "presented", "did_not_attend", "cancelled"] as const, "unknown");
    if (Object.keys(event).length) {
      await tx`insert into public.events (entry_id) values (${id}) on conflict (entry_id) do nothing`;
      await tx`update public.events set ${tx(event)} where entry_id = ${id}`;
    }
    const feedback = pick(patch.feedback, FEEDBACK_FIELDS);
    if (Object.keys(feedback).length) await tx`update public.feedback set ${tx(feedback)} where entry_id = ${id}`;
    const enquiry = pick(patch.enquiry, ENQUIRY_FIELDS);
    if ("status" in enquiry) enquiry.status = oneOf(enquiry.status, ["open", "waiting", "closed"] as const, "open");
    if ("followUpDate" in enquiry) enquiry.followUpDate = dateOrNull(enquiry.followUpDate);
    if (Object.keys(enquiry).length) {
      await tx`update public.enquiries set ${tx(enquiry)},
               closed_at = case when ${enquiry.status ?? null}::text = 'closed' then coalesce(closed_at, now())
                                when ${enquiry.status ?? null}::text is null then closed_at else null end
               where entry_id = ${id}`;
    }
    return { version: row.version };
  });
}

export async function setEntryDate(id: string, expectedVersion: number, date: PartialDate) {
  return run(async (tx) => {
    const d = checkPartial(date);
    const [row] = await tx<{ version: number }[]>`
      update public.entries set entry_date = ${d.date}, entry_precision = ${d.precision}, version = version + 1
      where id = ${id} and version = ${expectedVersion} returning version`;
    if (!row) throw new ConflictError();
    refresh();
    return { version: row.version };
  });
}

export async function archiveEntry(id: string) {
  const r = await run(async (tx) => {
    await tx`update public.entries set archived_at = now(), version = version + 1 where id = ${id}`;
  });
  if (r.ok) redirect("/journal");
  return r;
}

export async function trashEntry(id: string) {
  const r = await run(async (tx) => {
    await tx`update public.entries set deleted_at = now(), version = version + 1 where id = ${id}`;
  });
  if (r.ok) redirect("/journal");
  return r;
}

export async function restoreEntry(id: string) {
  return run(async (tx) => {
    await tx`update public.entries set deleted_at = null, archived_at = null, version = version + 1 where id = ${id}`;
    refresh();
  });
}

export async function addLink(parentType: "entry" | "project" | "manuscript", parentId: string, form: FormData) {
  return run(async (tx) => {
    await insertLink(tx, parentType, parentId, String(form.get("url") ?? ""), String(form.get("label") ?? ""));
    refresh();
  });
}
