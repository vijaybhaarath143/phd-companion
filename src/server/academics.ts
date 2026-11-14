import "server-only";
import type { Tx } from "@/server/db";
import type { Precision } from "@/lib/dates";
import { getCredits } from "@/server/home";

export async function getAcademics(tx: Tx) {
  const [requirement] = await tx<{ id: string; label: string; periodLabel: string | null; requiredCredits: number | null }[]>`
    select id, label, period_label, required_credits from public.requirements order by created_at limit 1`;
  const credits = await getCredits(tx);
  const courses = await tx<{ id: string; name: string; provider: string | null; credits: number | null; status: string; completedOn: string | null; recognised: number; version: number }[]>`
    select c.id, c.name, c.provider, c.credits, c.status, c.completed_on, c.version,
      coalesce((select sum(amount) from public.credit_recognitions r where r.course_id = c.id), 0)::float8 as recognised
    from public.courses c where c.deleted_at is null order by c.created_at`;
  const milestones = await tx<{ id: string; title: string; status: string; targetDate: string | null; targetPrecision: Precision; doneOn: string | null; donePrecision: Precision; projectTitle: string | null }[]>`
    select m.id, m.title, m.status, m.target_date, m.target_precision, m.done_on, m.done_precision, p.title as project_title
    from public.milestones m left join public.projects p on p.id = m.project_id
    order by m.sort, m.created_at`;
  const enquiries = await tx<{ entryId: string; title: string; office: string | null; contact: string | null; response: string | null; followUpDate: string | null; status: string }[]>`
    select q.entry_id, e.title, q.office, q.contact, q.response, q.follow_up_date, q.status
    from public.enquiries q join public.entries e on e.id = q.entry_id
    where e.deleted_at is null
    order by (q.status = 'closed'), q.follow_up_date nulls last, e.created_at desc`;
  return { requirement: requirement ?? null, credits, courses, milestones, enquiries };
}
