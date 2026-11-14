"use server";

import { refresh } from "next/cache";
import { run, ValidationError, creditsOrNull, oneOf, required, text, dateOrNull, uuidOrNull } from "@/server/actions/run";
import { readPartialDate } from "@/lib/dates";

export async function saveRequirement(form: FormData) {
  return run(async (tx) => {
    const label = text(form.get("label"), 200) ?? "Coursework credits";
    const period = text(form.get("period"), 100);
    const credits = creditsOrNull(form.get("credits"));
    const [existing] = await tx<{ id: string }[]>`select id from public.requirements order by created_at limit 1`;
    if (existing) {
      await tx`update public.requirements set label = ${label}, period_label = ${period}, required_credits = ${credits}, version = version + 1 where id = ${existing.id}`;
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
                     ${oneOf(form.get("status"), ["planned", "enrolled", "completed", "dropped"] as const, "enrolled")})`;
    refresh();
  });
}

export async function updateCourse(id: string, form: FormData) {
  return run(async (tx) => {
    const status = oneOf(form.get("status"), ["planned", "enrolled", "completed", "dropped"] as const, "enrolled")!;
    // Completing a course never records recognition — that's a separate, explicit step.
    await tx`update public.courses set
               status = ${status},
               credits = ${creditsOrNull(form.get("credits"))},
               completed_on = case when ${status} = 'completed' then coalesce(completed_on, current_date) else null end,
               version = version + 1
             where id = ${id}`;
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

export async function setMilestoneStatus(id: string, form: FormData) {
  return run(async (tx) => {
    const status = oneOf(form.get("status"), ["not_started", "done", "skipped"] as const, "not_started")!;
    const done = status === "done" ? readPartialDate(form, "done") : { date: null, precision: "none" as const };
    await tx`update public.milestones set status = ${status}, done_on = ${done.date}, done_precision = ${done.precision}, version = version + 1 where id = ${id}`;
    refresh();
  });
}

export async function addEnquiry(form: FormData) {
  return run(async (tx) => {
    const title = required(form.get("title"), "What you asked");
    const [e] = await tx<{ id: string }[]>`
      insert into public.entries (title, kind, category, entry_date, entry_precision)
      values (${title}, 'enquiry', 'administrative', current_date, 'day') returning id`;
    await tx`insert into public.enquiries (entry_id, office, contact, follow_up_date)
             values (${e.id}, ${text(form.get("office"), 200)}, ${text(form.get("contact"), 200)}, ${dateOrNull(form.get("followUp"))})`;
    refresh();
  });
}

export async function updateEnquiry(entryId: string, form: FormData) {
  return run(async (tx) => {
    const status = oneOf(form.get("status"), ["open", "waiting", "closed"] as const, "open")!;
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
