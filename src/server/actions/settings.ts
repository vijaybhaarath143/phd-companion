"use server";

import { refresh } from "next/cache";
import { run, oneOf, required, text, dateOrNull } from "@/server/actions/run";
import { ensureProfile } from "@/server/profile";
import { TIMEZONES } from "@/lib/timezones";


export async function updateProfile(form: FormData) {
  return run(async (tx) => {
    await ensureProfile(tx);
    const month = String(form.get("startMonth") ?? "");
    const year = String(form.get("startYear") ?? "");
    const start = /^\d{2}$/.test(month) && /^\d{4}$/.test(year) ? `${year}-${month}-01` : null;
    const tz = String(form.get("timezone") ?? "");
    await tx`update public.profiles set
               display_name = ${text(form.get("name"), 120)},
               university = ${text(form.get("university"), 200)},
               department = ${text(form.get("department"), 200)},
               guide_name = ${text(form.get("guide"), 200)},
               programme_start = ${start},
               programme_start_precision = ${start ? "month" : "none"},
               timezone = ${TIMEZONES.includes(tz) ? tz : "Asia/Kolkata"},
               version = version + 1
             where user_id = auth.uid()`;
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

export async function restoreFromTrash(table: "entries" | "tasks" | "projects", id: string) {
  return run(async (tx) => {
    const t = oneOf(table, ["entries", "tasks", "projects"] as const)!;
    await tx`update ${tx("public." + t)} set deleted_at = null, archived_at = null, version = version + 1 where id = ${id}`;
    refresh();
  });
}

export async function addGoal(form: FormData) {
  return run(async (tx) => {
    await tx`insert into public.goals (title, horizon, period_start, period_end)
             values (${required(form.get("title"), "Goal")},
                     ${oneOf(form.get("horizon"), ["week", "month", "semester", "year"] as const, "month")},
                     ${dateOrNull(form.get("start"))}, ${dateOrNull(form.get("end"))})`;
    refresh();
  });
}

export async function setGoalOutcome(id: string, outcome: string) {
  return run(async (tx) => {
    await tx`update public.goals set outcome = ${oneOf(outcome, ["open", "achieved", "dropped"] as const, "open")}, version = version + 1 where id = ${id}`;
    refresh();
  });
}
