"use server";

import { refresh } from "next/cache";
import { run, oneOf, required, text, dateOrNull, uuidOrNull, versionOf, expectRow, ValidationError } from "@/server/actions/run";
import { ensureProfile } from "@/server/profile";
import { TIMEZONES } from "@/lib/timezones";

const GOAL_HORIZONS = ["week", "month", "semester", "year"] as const;

export async function updateProfile(form: FormData) {
  return run(async (tx) => {
    await ensureProfile(tx);
    const version = versionOf(form.get("version"));
    const month = String(form.get("startMonth") ?? "");
    const year = String(form.get("startYear") ?? "");
    const start = /^(0[1-9]|1[0-2])$/.test(month) && /^\d{4}$/.test(year) ? `${year}-${month}-01` : null;
    const tz = String(form.get("timezone") ?? "");
    expectRow(await tx`update public.profiles set
               display_name = ${text(form.get("name"), 120)},
               phd_title = ${text(form.get("phdTitle"), 300)},
               university = ${text(form.get("university"), 200)},
               department = ${text(form.get("department"), 200)},
               guide_name = ${text(form.get("guide"), 200)},
               programme_start = ${start},
               programme_start_precision = ${start ? "month" : "none"},
               timezone = ${TIMEZONES.includes(tz) ? tz : "Asia/Kolkata"},
               version = version + 1
             where user_id = auth.uid() and version = ${version}
             returning user_id`);
    refresh();
  });
}

export async function setReminders(enabled: boolean) {
  return run(async (tx) => {
    await ensureProfile(tx);
    await tx`update public.profiles set reminders_enabled = ${enabled} where user_id = auth.uid()`;
    refresh();
  });
}

/** What Settings → Trash / Archive can bring back. */
const RESTORABLE = ["entries", "tasks", "courses", "goals", "notes"] as const;
export type RestorableTable = (typeof RESTORABLE)[number];

export async function restoreFromTrash(table: RestorableTable, id: string) {
  return run(async (tx) => {
    const t = oneOf(table, RESTORABLE);
    if (!t) throw new ValidationError("That can't be restored.");
    const archivable = t !== "goals" && t !== "notes"; // goals and notes have no archive
    await tx`update ${tx("public." + t)} set deleted_at = null, ${archivable ? tx`archived_at = null,` : tx``} version = version + 1 where id = ${id}`;
    refresh();
  });
}

/**
 * The Undo on a "Moved to Trash" toast: takes it back out of Trash only, so something
 * that was archived before it was trashed goes back to the archive, not the main list.
 */
export async function undoTrash(table: RestorableTable, id: string) {
  return run(async (tx) => {
    const t = oneOf(table, RESTORABLE);
    if (!t) throw new ValidationError("That can't be restored.");
    expectRow(await tx`update ${tx("public." + t)} set deleted_at = null, version = version + 1
                       where id = ${id} and deleted_at is not null returning id`);
    refresh();
  });
}

function goalFields(form: FormData) {
  const start = dateOrNull(form.get("start"));
  const end = dateOrNull(form.get("end"));
  if (start && end && end < start) throw new ValidationError("The end date is before the start date.");
  return {
    title: required(form.get("title"), "Goal"),
    horizon: oneOf(form.get("horizon"), GOAL_HORIZONS, "month"),
    periodStart: start,
    periodEnd: end,
  };
}

export async function addGoal(form: FormData) {
  return run(async (tx) => {
    const g = goalFields(form);
    await tx`insert into public.goals (title, horizon, period_start, period_end)
             values (${g.title}, ${g.horizon}, ${g.periodStart}, ${g.periodEnd})`;
    refresh();
  });
}

export async function updateGoal(id: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    expectRow(await tx`update public.goals set ${tx(goalFields(form))}, version = version + 1
                       where id = ${id} and version = ${version} and deleted_at is null returning id`);
    refresh();
  });
}

export async function trashGoal(id: string) {
  return run(async (tx) => {
    expectRow(await tx`update public.goals set deleted_at = now(), version = version + 1 where id = ${id} and deleted_at is null returning id`);
    refresh();
  });
}

export async function setGoalOutcome(id: string, outcome: string) {
  return run(async (tx) => {
    expectRow(await tx`update public.goals set outcome = ${oneOf(outcome, ["open", "achieved", "dropped"] as const, "open")}, version = version + 1
                       where id = ${id} and deleted_at is null returning id`);
    refresh();
  });
}

/** Undo for things removed from a list (not Trash): a trial, a review step, a course deadline. */
const REMOVABLE = { trial: "experiment_trials", review_step: "review_steps", course_item: "course_items" } as const;

export async function undoRemove(kind: keyof typeof REMOVABLE, id: string) {
  return run(async (tx) => {
    const table = kind in REMOVABLE ? REMOVABLE[kind] : null;
    if (!table) throw new ValidationError("That can't be restored.");
    expectRow(await tx`update ${tx("public." + table)} set removed_at = null, version = version + 1
                       where id = ${uuidOrNull(id)} and removed_at is not null returning id`);
    refresh();
  });
}
