"use server";

import { refresh } from "next/cache";
import { run, ValidationError, creditsOrNull, oneOf, required, text, dateOrNull, uuidOrNull, versionOf, expectRow } from "@/server/actions/run";
import { readPartialDate } from "@/lib/dates";
import { insertCourseItem } from "@/server/writes";

const COURSE_STATUSES = ["planned", "enrolled", "completed", "dropped"] as const;

export async function saveRequirement(form: FormData) {
  return run(async (tx) => {
    const label = text(form.get("label"), 200) ?? "Coursework credits";
    const period = text(form.get("period"), 100);
    const credits = creditsOrNull(form.get("credits"));
    const [existing] = await tx<{ id: string }[]>`select id from public.requirements order by created_at limit 1`;
    if (existing) {
      const version = versionOf(form.get("version"));
      expectRow(await tx`update public.requirements set label = ${label}, period_label = ${period}, required_credits = ${credits}, version = version + 1
                         where id = ${existing.id} and version = ${version} returning id`);
    } else {
      await tx`insert into public.requirements (label, period_label, required_credits) values (${label}, ${period}, ${credits})`;
    }
    refresh();
  });
}

export async function addCourse(form: FormData) {
  return run(async (tx) => {
    await tx`insert into public.courses (name, provider, credits, status)
             values (${required(form.get("name"), "Course name")}, ${text(form.get("provider"), 200)},
                     ${creditsOrNull(form.get("credits"))},
                     ${oneOf(form.get("status"), COURSE_STATUSES, "enrolled")})`;
    refresh();
  });
}

export async function updateCourse(id: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    const status = oneOf(form.get("status"), COURSE_STATUSES, "enrolled")!;
    const fields: Record<string, unknown> = { status, credits: creditsOrNull(form.get("credits")) };
    if (form.has("name")) fields.name = required(form.get("name"), "Course name");
    if (form.has("provider")) fields.provider = text(form.get("provider"), 200);
    // Completing a course never records recognition — that's a separate, explicit step.
    // "Completed on" is her own day, not the database's (UTC).
    expectRow(await tx`update public.courses set ${tx(fields)},
               completed_on = case when ${status} = 'completed' then coalesce(completed_on, app.user_today()) else null end,
               version = version + 1
             where id = ${id} and version = ${version} and deleted_at is null
             returning id`);
    refresh();
  });
}

export async function trashCourse(id: string) {
  return run(async (tx) => {
    expectRow(await tx`update public.courses set deleted_at = now(), version = version + 1 where id = ${id} and deleted_at is null returning id`);
    refresh();
  });
}

export async function recordRecognition(courseId: string, form: FormData) {
  return run(async (tx) => {
    const amount = creditsOrNull(form.get("amount"));
    if (!amount) throw new ValidationError("Enter the number of credits the university recognised.");
    const date = readPartialDate(form, "recognised");
    await tx`insert into public.credit_recognitions (course_id, amount, recognised_on, recognised_precision, reference)
             values (${courseId}, ${amount}, ${date.date}, ${date.precision}, ${text(form.get("reference"), 300)})`;
    refresh();
  });
}

export async function addMilestone(form: FormData) {
  return run(async (tx) => {
    const target = readPartialDate(form, "target");
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(sort), 0) + 1 as next from public.milestones`;
    await tx`insert into public.milestones (title, target_date, target_precision, project_id, sort)
             values (${required(form.get("title"), "Milestone")}, ${target.date}, ${target.precision},
                     ${uuidOrNull(form.get("projectId"))}, ${next})`;
    refresh();
  });
}

/** A milestone's "Update": title, target date, status and (when done) the day or month it was done. */
export async function updateMilestone(id: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    const status = oneOf(form.get("status"), ["not_started", "done", "skipped"] as const, "not_started")!;
    const done = status === "done" ? readPartialDate(form, "done") : { date: null, precision: "none" as const };
    const fields: Record<string, unknown> = { status, doneOn: done.date, donePrecision: done.precision };
    if (form.has("title")) fields.title = required(form.get("title"), "Milestone");
    if (form.has("targetPrecision")) {
      const target = readPartialDate(form, "target");
      fields.targetDate = target.date;
      fields.targetPrecision = target.precision;
    }
    expectRow(await tx`update public.milestones set ${tx(fields)}, version = version + 1
                       where id = ${id} and version = ${version} returning id`);
    refresh();
  });
}

export async function addEnquiry(form: FormData) {
  return run(async (tx) => {
    const title = required(form.get("title"), "What you asked");
    // dated today on her own clock, not the database's (UTC)
    const [e] = await tx<{ id: string }[]>`
      insert into public.entries (title, kind, category, entry_date, entry_precision)
      values (${title}, 'enquiry', 'administrative', app.user_today(), 'day') returning id`;
    await tx`insert into public.enquiries (entry_id, office, contact, follow_up_date)
             values (${e.id}, ${text(form.get("office"), 200)}, ${text(form.get("contact"), 200)}, ${dateOrNull(form.get("followUp"))})`;
    refresh();
  });
}

/**
 * Academics' "Update" for an enquiry. Checks (and moves on) the enquiry's journal entry
 * version, which is what the Entry page saves against, so neither screen overwrites the other.
 */
export async function updateEnquiry(entryId: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    const status = oneOf(form.get("status"), ["open", "waiting", "closed"] as const, "open")!;
    expectRow(await tx`update public.entries set version = version + 1
                       where id = ${entryId} and version = ${version} and deleted_at is null returning id`);
    // Enquiries only close when the person closes them.
    await tx`update public.enquiries set
               response = ${text(form.get("response"), 5000)},
               follow_up_date = ${dateOrNull(form.get("followUp"))},
               status = ${status},
               closed_at = case when ${status} = 'closed' then coalesce(closed_at, now()) else null end,
               version = version + 1
             where entry_id = ${entryId}`;
    refresh();
  });
}

// ---------------------------------------------------------------- course deadlines

const ITEM_KINDS = ["assignment", "exam_registration", "exam"] as const;

/** An assignment, exam registration or exam for a course; dated ones show in Reminders and the calendar. */
export async function addCourseItem(courseId: string, form: FormData) {
  return run(async (tx) => {
    await insertCourseItem(tx, { courseId, kind: oneOf(form.get("kind"), ITEM_KINDS, "assignment")!, title: text(form.get("title"), 200), dueDate: dateOrNull(form.get("dueDate")) });
    refresh();
  });
}

export async function toggleCourseItem(id: string, done: boolean) {
  return run(async (tx) => {
    const [row] = await tx`
      update public.course_items set done_at = ${done ? tx`now()` : null}, version = version + 1
      where id = ${uuidOrNull(id)} and removed_at is null and exists (select 1 from public.courses c where c.id = course_id and c.deleted_at is null) returning id`;
    if (!row) throw new ValidationError("That deadline wasn't found.");
    refresh();
  });
}

/** Hidden, not erased (still in the export). */
export async function removeCourseItem(id: string) {
  return run(async (tx) => {
    const [row] = await tx`update public.course_items set removed_at = now(), version = version + 1 where id = ${uuidOrNull(id)} and removed_at is null and exists (select 1 from public.courses c where c.id = course_id and c.deleted_at is null) returning id`;
    if (!row) throw new ValidationError("That deadline wasn't found.");
    refresh();
  });
}

// ---------------------------------------------------------------- admin key details

/** Saves the whole list of label → value pairs (blank rows are dropped). */
export async function saveAdminDetails(form: FormData) {
  return run(async (tx) => {
    const labels = form.getAll("label").map((v) => String(v).trim());
    const values = form.getAll("value").map((v) => String(v).trim());
    const details = labels
      .map((label, i) => ({ label: label.slice(0, 120), value: (values[i] ?? "").slice(0, 500) }))
      .filter((d) => d.label || d.value)
      .map((d) => ({ label: d.label || "Detail", value: d.value }));
    if (details.length > 50) throw new ValidationError("Keep it to 50 details.");
    await tx`update public.profiles set admin_details = ${tx.json(details)}, version = version + 1 where user_id = auth.uid()`;
    refresh();
  });
}
