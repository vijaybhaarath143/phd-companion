import "server-only";
import type { Tx } from "@/server/db";
import { formatPartialDate, formatFullDay, type Precision } from "@/lib/dates";
import { phases, type Phase } from "@/lib/labels";
import { summariseCredits, type CreditSummary } from "@/lib/credits";

export type AttentionItem = { title: string; detail: string; href: string; badge?: string; attention?: boolean };
export type ListItem = { id: string; title: string; detail: string; href: string; badge?: string };

export async function getCredits(tx: Tx): Promise<{ label: string; period: string | null; summary: CreditSummary } | null> {
  const [req] = await tx<{ label: string; periodLabel: string | null; requiredCredits: number | null }[]>`
    select label, period_label, required_credits from public.requirements order by created_at limit 1`;
  const courses = await tx<{ status: "planned" | "enrolled" | "completed" | "dropped"; credits: number | null; recognised: number }[]>`
    select c.status, c.credits, coalesce((select sum(amount) from public.credit_recognitions r where r.course_id = c.id), 0)::float8 as recognised
    from public.courses c where c.deleted_at is null`;
  if (!req && courses.length === 0) return null;
  return {
    label: req?.label ?? "Coursework credits",
    period: req?.periodLabel ?? null,
    summary: summariseCredits(req?.requiredCredits ?? null, courses),
  };
}

export async function getHome(tx: Tx, today: string) {
  const overdue = await tx<{ id: string; title: string; dueDate: string; projectTitle: string | null }[]>`
    select t.id, t.title, t.due_date, p.title as project_title
    from public.tasks t left join public.projects p on p.id = t.project_id
    where t.deleted_at is null and t.status not in ('done', 'cancelled') and t.due_date < ${today}
    order by t.due_date limit 5`;

  const waiting = await tx<{ id: string; title: string; waitingReason: string | null; manuscriptId: string | null; manuscriptTitle: string | null; projectTitle: string | null }[]>`
    select t.id, t.title, t.waiting_reason, t.manuscript_id, m.title as manuscript_title, p.title as project_title
    from public.tasks t
    left join public.manuscripts m on m.id = t.manuscript_id
    left join public.projects p on p.id = t.project_id
    where t.deleted_at is null and t.status = 'waiting'
    order by t.created_at limit 5`;

  const feedback = await tx<{ entryId: string; title: string; manuscriptId: string | null; manuscriptTitle: string | null }[]>`
    select f.entry_id, e.title, f.manuscript_id, m.title as manuscript_title
    from public.feedback f join public.entries e on e.id = f.entry_id
    left join public.manuscripts m on m.id = f.manuscript_id
    where f.resolution_status = 'open' and e.deleted_at is null
    order by m.title nulls last, e.created_at limit 5`;

  const enquiries = await tx<{ entryId: string; title: string; followUpDate: string | null }[]>`
    select q.entry_id, e.title, q.follow_up_date
    from public.enquiries q join public.entries e on e.id = q.entry_id
    where q.status <> 'closed' and e.deleted_at is null and q.follow_up_date <= ${today}
    order by q.follow_up_date limit 5`;

  const blockers = await tx<{ id: string; description: string; entryId: string | null }[]>`
    select id, description, entry_id from public.blockers where resolved_on is null order by opened_on limit 5`;

  const [{ undated }] = await tx<{ undated: number }[]>`
    select count(*)::int as undated from public.entries
    where entry_precision = 'none' and deleted_at is null and archived_at is null`;

  const credits = await getCredits(tx);

  const attention: AttentionItem[] = [];
  for (const t of overdue)
    attention.push({ title: t.title, detail: `Was due ${formatFullDay(t.dueDate)}${t.projectTitle ? ` · ${short(t.projectTitle)}` : ""}`, href: "/planner", badge: "Overdue", attention: true });
  for (const f of feedback)
    attention.push({ title: "Guide feedback to address", detail: f.manuscriptTitle ?? f.title, href: f.manuscriptId ? `/research/manuscripts/${f.manuscriptId}` : `/journal/${f.entryId}`, badge: "Open", attention: true });
  for (const w of waiting)
    attention.push({
      title: w.title,
      detail: w.waitingReason ?? w.manuscriptTitle ?? (w.projectTitle ? short(w.projectTitle) : "Waiting"),
      href: w.manuscriptId ? `/research/manuscripts/${w.manuscriptId}` : "/planner?show=waiting",
      badge: "Waiting",
      attention: true,
    });
  for (const q of enquiries)
    attention.push({ title: q.title, detail: `Follow up${q.followUpDate ? ` — due ${formatFullDay(q.followUpDate)}` : ""}`, href: "/academics#enquiries", badge: "Follow up", attention: true });
  for (const b of blockers)
    attention.push({ title: "Research blocker", detail: b.description, href: b.entryId ? `/research/experiments/${b.entryId}` : "/research", badge: "Blocked", attention: true });
  if (undated > 0)
    attention.push({ title: `${undated} ${undated === 1 ? "entry needs" : "entries need"} a date`, detail: "Add a day or a month when you know it", href: "/journal#needs-date", badge: "Journal" });
  if (credits?.summary.incomplete)
    attention.push({ title: "Credit total is incomplete", detail: "A course has no credit value yet", href: "/academics", badge: "Academics" });

  const projects = await tx<{ id: string; title: string; openTasks: number; experiments: number; phase: Phase | null; manuscriptTitle: string | null }[]>`
    select p.id, p.title,
      (select count(*)::int from public.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('done','cancelled')) as open_tasks,
      (select count(*)::int from public.entries e where e.project_id = p.id and e.kind = 'experiment' and e.deleted_at is null) as experiments,
      m.current_phase as phase, m.title as manuscript_title
    from public.projects p
    left join lateral (select current_phase, title from public.manuscripts m where m.project_id = p.id and m.deleted_at is null order by m.created_at desc limit 1) m on true
    where p.deleted_at is null and p.archived_at is null and p.status not in ('completed')
    order by p.created_at`;

  const workingOn: ListItem[] = projects.map((p) => {
    const bits: string[] = [];
    if (p.phase) bits.push(`Manuscript: ${phases[p.phase]}`);
    if (p.experiments) bits.push(`${p.experiments} experiment${p.experiments > 1 ? "s" : ""}`);
    bits.push(p.openTasks ? `${p.openTasks} open task${p.openTasks > 1 ? "s" : ""}` : "No open tasks");
    return { id: p.id, title: p.title, detail: bits.join(" · "), href: `/research/projects/${p.id}` };
  });

  const upcomingEntries = await tx<{ id: string; title: string; entryDate: string; entryPrecision: Precision; registration: string | null }[]>`
    select e.id, e.title, e.entry_date, e.entry_precision, ev.registration
    from public.entries e left join public.events ev on ev.entry_id = e.id
    where e.deleted_at is null and e.archived_at is null
      and (e.date_from > ${today} or (e.status = 'planned' and e.date_to >= ${today}))
      and coalesce(e.status, '') <> 'cancelled'
    order by e.date_from limit 4`;
  const upcomingTasks = await tx<{ id: string; title: string; dueDate: string }[]>`
    select id, title, due_date from public.tasks
    where deleted_at is null and status not in ('done','cancelled') and due_date >= ${today}
    order by due_date limit 4`;
  const comingUp: ListItem[] = [
    ...upcomingTasks.map((t) => ({ id: t.id, title: t.title, detail: `Task due ${formatFullDay(t.dueDate)}`, href: "/planner", sort: t.dueDate })),
    ...upcomingEntries.map((e) => ({
      id: e.id,
      title: e.title,
      detail: formatPartialDate(e.entryDate, e.entryPrecision),
      href: `/journal/${e.id}`,
      badge: e.registration === "registered" ? "Registered" : undefined,
      sort: e.entryDate,
    })),
  ]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .slice(0, 5)
    .map(({ sort: _sort, ...rest }) => rest);

  const recent = await tx<{ id: string; title: string; entryDate: string | null; entryPrecision: Precision; projectTitle: string | null }[]>`
    select e.id, e.title, e.entry_date, e.entry_precision, p.title as project_title
    from public.entries e left join public.projects p on p.id = e.project_id
    where e.deleted_at is null and e.archived_at is null
    order by e.created_at desc limit 4`;

  return {
    attention: attention.slice(0, 6),
    attentionTotal: attention.length,
    workingOn,
    comingUp,
    recent: recent.map((e) => ({
      id: e.id,
      title: e.title,
      detail: [formatPartialDate(e.entryDate, e.entryPrecision), e.projectTitle ? short(e.projectTitle) : null].filter(Boolean).join(" · "),
      href: `/journal/${e.id}`,
    })),
    credits,
    isEmpty: recent.length === 0,
  };
}

/** "SLR 1: Electrochemical…" → "SLR 1" when the title has a short prefix. */
export function short(title: string) {
  const i = title.indexOf(":");
  return i > 0 && i <= 12 ? title.slice(0, i) : title;
}
