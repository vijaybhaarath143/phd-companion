import "server-only";
import type { Tx } from "@/server/db";
import { formatPartialDate, formatFullDay, type Precision } from "@/lib/dates";
import { phases, type Phase } from "@/lib/labels";
import { summariseCredits, type CreditSummary } from "@/lib/credits";
import type { TaskPriority } from "@/lib/labels";
import { getTimeline } from "@/server/timeline";

export type AttentionItem = { title: string; detail: string; href: string; badge?: string; attention?: boolean };
export type StepProgress = { done: number; total: number; current: string | null; currentNo: number | null };
export type ListItem = { id: string; title: string; detail: string; href: string; badge?: string; steps?: StepProgress };

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
    select b.id, b.description, b.entry_id from public.blockers b
    where b.resolved_on is null
      and (b.entry_id is null or exists (select 1 from public.entries e where e.id = b.entry_id and e.deleted_at is null and e.archived_at is null))
    order by b.opened_on limit 5`;

  const [{ undated }] = await tx<{ undated: number }[]>`
    select count(*)::int as undated from public.entries
    where entry_precision = 'none' and deleted_at is null and archived_at is null`;

  const credits = await getCredits(tx);

  const attention: AttentionItem[] = [];
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

  const steps = await reviewProgress(tx, projects.map((p) => p.id));
  const workingOn: ListItem[] = projects.map((p) => {
    const bits: string[] = [];
    const s = steps.get(p.id);
    if (s) bits.push(s.current ? `Step ${s.currentNo} of ${s.total} · ${s.current}` : `All ${s.total} steps done`);
    if (p.phase) bits.push(`Manuscript: ${phases[p.phase]}`);
    if (p.experiments) bits.push(`${p.experiments} experiment${p.experiments > 1 ? "s" : ""}`);
    bits.push(p.openTasks ? `${p.openTasks} open task${p.openTasks > 1 ? "s" : ""}` : "No open tasks");
    return { id: p.id, title: p.title, detail: bits.join(" · "), href: s ? `/research/projects/${p.id}#progress` : `/research/projects/${p.id}`, steps: s };
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
    // "First day" only when nothing at all has been recorded yet — not just no journal entries.
    isEmpty: !(await hasAnyRecords(tx)),
  };
}

/** Has she recorded anything yet (of any kind, outside Trash)? */
export async function hasAnyRecords(tx: Tx) {
  const [{ any }] = await tx<{ any: boolean }[]>`
    select exists (select 1 from public.entries where deleted_at is null)
        or exists (select 1 from public.tasks where deleted_at is null)
        or exists (select 1 from public.projects where deleted_at is null)
        or exists (select 1 from public.manuscripts where deleted_at is null)
        or exists (select 1 from public.courses where deleted_at is null)
        or exists (select 1 from public.milestones)
        or exists (select 1 from public.goals where deleted_at is null)
        or exists (select 1 from public.requirements)
        or exists (select 1 from public.notes where deleted_at is null) as any`;
  return any;
}

/** Free hosting keeps no backups: remind her when there's data and no export in the last 7 days. */
export function needsBackupReminder(lastExportAt: Date | null, hasRecords: boolean, now = new Date()) {
  if (!hasRecords) return false;
  return !lastExportAt || now.getTime() - new Date(lastExportAt).getTime() > 7 * 24 * 60 * 60 * 1000;
}

/** "SLR 1: Electrochemical…" → "SLR 1" when the title has a short prefix. */
export function short(title: string) {
  const i = title.indexOf(":");
  return i > 0 && i <= 12 ? title.slice(0, i) : title;
}

// ---------------------------------------------------------------- Home: reminders, calendar, updates, areas

export type Reminder = {
  key: string;
  kind: "task" | "deadline" | "event";
  /** task id, for the Done tick-box */
  taskId: string | null;
  title: string;
  detail: string;
  href: string;
  date: string | null;
  priority: TaskPriority;
  waiting: boolean;
  overdue: boolean;
};
export type ReminderGroups = { overdue: Reminder[]; today: Reminder[]; week: Reminder[]; later: Reminder[]; undated: Reminder[] };

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

/**
 * Every open task, course deadline and coming event, grouped by when: overdue, today, the
 * next 7 days, later, and no date yet. Within a group: date, then High → Normal → Low.
 */
export async function getReminders(tx: Tx, today: string): Promise<ReminderGroups> {
  const tasks = await tx<{ id: string; title: string; dueDate: string | null; priority: TaskPriority; status: string; projectTitle: string | null; courseName: string | null; waitingReason: string | null }[]>`
    select t.id, t.title, t.due_date, t.priority, t.status, p.title as project_title, c.name as course_name, t.waiting_reason
    from public.tasks t
    left join public.projects p on p.id = t.project_id
    left join public.courses c on c.id = t.course_id
    where t.deleted_at is null and t.status in ('todo', 'doing', 'waiting')
    order by t.due_date nulls last, t.created_at
    limit 200`;
  const deadlines = await tx<{ id: string; kind: string; title: string; dueDate: string | null; courseName: string }[]>`
    select i.id, i.kind, i.title, i.due_date, c.name as course_name
    from public.course_items i join public.courses c on c.id = i.course_id
    where i.done_at is null and i.removed_at is null and c.deleted_at is null and c.status <> 'dropped'
    order by i.due_date nulls last
    limit 100`;
  // coming events, and ones with no date yet that she hasn't been to (as on the Events page)
  const events = await tx<{ id: string; title: string; entryDate: string | null; entryPrecision: Precision; dateFrom: string | null; dateTo: string | null; registration: string | null }[]>`
    select e.id, e.title, e.entry_date, e.entry_precision, e.date_from, e.date_to, ev.registration
    from public.entries e left join public.events ev on ev.entry_id = e.id
    where e.deleted_at is null and e.archived_at is null and e.kind = 'event'
      and coalesce(e.status, '') <> 'cancelled'
      and coalesce(ev.participation, 'unknown') not in ('attended', 'presented', 'did_not_attend', 'cancelled')
      and (e.date_to >= ${today} or e.entry_precision = 'none')
    order by e.date_from nulls last limit 20`;

  const all: Reminder[] = [
    ...tasks.map((t) => ({
      key: `task:${t.id}`,
      kind: "task" as const,
      taskId: t.id,
      title: t.title,
      detail: [t.projectTitle ? short(t.projectTitle) : t.courseName, t.dueDate ? `${t.dueDate < today ? "was due" : "due"} ${formatFullDay(t.dueDate)}` : null, t.status === "waiting" ? `waiting${t.waitingReason ? ` — ${t.waitingReason}` : ""}` : null]
        .filter(Boolean)
        .join(" · "),
      href: "/planner",
      date: t.dueDate,
      priority: t.priority,
      waiting: t.status === "waiting",
      overdue: Boolean(t.dueDate && t.dueDate < today),
    })),
    ...deadlines.map((d) => ({
      key: `deadline:${d.id}`,
      kind: "deadline" as const,
      taskId: null,
      title: d.title,
      detail: [d.courseName, d.kind === "exam_registration" ? "exam registration" : d.kind === "exam" ? "exam" : "assignment", d.dueDate ? `${d.dueDate < today ? "was due" : "due"} ${formatFullDay(d.dueDate)}` : null].filter(Boolean).join(" · "),
      href: "/academics#courses",
      date: d.dueDate,
      priority: "normal" as const,
      waiting: false,
      overdue: Boolean(d.dueDate && d.dueDate < today),
    })),
    ...events.map((e) => ({
      key: `event:${e.id}`,
      kind: "event" as const,
      taskId: null,
      title: e.title,
      detail: [e.entryDate ? formatPartialDate(e.entryDate, e.entryPrecision) : null, e.registration === "registered" ? "registered" : e.registration === "interested" ? "interested" : null, "event"].filter(Boolean).join(" · "),
      href: `/journal/${e.id}`,
      // a month-only event goes by the month's last day (it may fall any day in it), and is never overdue
      date: e.entryPrecision === "month" ? e.dateTo : e.dateFrom,
      priority: "normal" as const,
      waiting: false,
      overdue: false,
    })),
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  const weekEnd = addDays(today, 7);
  const groups: ReminderGroups = { overdue: [], today: [], week: [], later: [], undated: [] };
  for (const r of all) {
    if (!r.date) groups.undated.push(r);
    else if (r.overdue) groups.overdue.push(r);
    else if (r.date === today) groups.today.push(r);
    else if (r.date <= weekEnd) groups.week.push(r);
    else groups.later.push(r);
  }
  groups.undated.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  return groups;
}

export type HomeCalendar = { month: string; today: string; overdueDays: number[]; busyDays: number[] };

/**
 * This month at a glance: days that have something due or dated, and — in red — days whose
 * tasks or course deadlines are still open after their date.
 */
export async function getHomeCalendar(tx: Tx, today: string): Promise<HomeCalendar> {
  const month = today.slice(0, 7);
  const days = await tx<{ day: number; overdue: boolean }[]>`
    with dated as (
      select due_date as d, status not in ('done', 'cancelled') and due_date < ${today} as late
        from public.tasks where deleted_at is null and status <> 'cancelled' and to_char(due_date, 'YYYY-MM') = ${month}
      union all
      select due_date, done_at is null and due_date < ${today}
        from public.course_items i where removed_at is null and to_char(due_date, 'YYYY-MM') = ${month}
          and exists (select 1 from public.courses c where c.id = i.course_id and c.deleted_at is null and c.status <> 'dropped')
      union all
      select entry_date, false from public.entries
        where deleted_at is null and entry_precision = 'day' and to_char(entry_date, 'YYYY-MM') = ${month}
          and coalesce(status, '') <> 'cancelled'
      union all
      select target_date, false from public.milestones where target_precision = 'day' and to_char(target_date, 'YYYY-MM') = ${month}
    )
    select extract(day from d)::int as day, bool_or(late) as overdue from dated group by 1 order by 1`;
  return { month, today, overdueDays: days.filter((d) => d.overdue).map((d) => d.day), busyDays: days.filter((d) => !d.overdue).map((d) => d.day) };
}

/** The latest things from the Timeline, up to today. */
export async function getRecentUpdates(tx: Tx, today: string, timezone: string, count = 6) {
  const { dated } = await getTimeline(tx, { today, timezone, limit: 50, before: addDays(today, 1), wholeMonths: false });
  // things that happened — not what's due or planned (those are in Reminders)
  const NOT_UPDATES = new Set(["due", "target", "deadline", "planned", "follow_up"]);
  return dated.filter((i) => !i.future && !NOT_UPDATES.has(i.event)).slice(0, count).map((i) => ({ key: i.key, title: i.title, detail: [i.date ? formatPartialDate(i.date, i.precision) : null, i.label].filter(Boolean).join(" · "), href: i.href }));
}

export type Area = { key: string; label: string; count: number; detail: string; href: string };

/** Her areas of work (from her own list), each with how many records it holds. */
export async function getAreas(tx: Tx): Promise<Area[]> {
  const [c] = await tx<{ benchwork: number; courses: number; publications: number; meetings: number; events: number; admin: number }[]>`
    select
      (select count(*)::int from public.entries where deleted_at is null and archived_at is null and kind = 'experiment') as benchwork,
      (select count(*)::int from public.courses where deleted_at is null) as courses,
      (select count(*)::int from public.manuscripts where deleted_at is null and archived_at is null) as publications,
      (select count(*)::int from public.entries where deleted_at is null and archived_at is null and category = 'guide_meeting') as meetings,
      (select count(*)::int from public.entries where deleted_at is null and archived_at is null and category in ('conference', 'training', 'competition')) as events,
      (select count(*)::int from public.entries where deleted_at is null and archived_at is null and category = 'administrative') as admin`;
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  return [
    { key: "benchwork", label: "Benchwork", count: c.benchwork, detail: n(c.benchwork, "experiment", "experiments"), href: "/research?view=benchwork" },
    { key: "coursework", label: "Coursework", count: c.courses, detail: n(c.courses, "course", "courses"), href: "/academics" },
    { key: "publications", label: "Publications", count: c.publications, detail: n(c.publications, "manuscript", "manuscripts"), href: "/research?view=publications" },
    { key: "meetings", label: "Guide meetings", count: c.meetings, detail: n(c.meetings, "entry", "entries"), href: "/journal?category=guide_meeting" },
    { key: "events", label: "Conferences, workshops, training", count: c.events, detail: n(c.events, "event", "events"), href: "/events" },
    { key: "admin", label: "Admin info", count: c.admin, detail: n(c.admin, "entry", "entries"), href: "/academics#admin" },
  ];
}

/** Review steps per project: how many are dealt with (done or skipped), and the step she's on. */
export async function reviewProgress(tx: Tx, projectIds: string[]) {
  const map = new Map<string, StepProgress>();
  if (!projectIds.length) return map;
  // numbered as on the project page (skipped steps keep their number and count as dealt with)
  const rows = await tx<{ projectId: string; title: string; status: string }[]>`
    select project_id, title, status from public.review_steps
    where removed_at is null and project_id = any(${projectIds}::uuid[])
    order by project_id, sort`;
  const onProgress = new Set<string>();
  for (const r of rows) {
    const m = map.get(r.projectId) ?? { done: 0, total: 0, current: null, currentNo: null };
    m.total++;
    if (r.status === "done" || r.status === "skipped") m.done++;
    // the first step in progress, else the first one not started yet
    else if (r.status === "in_progress" ? !onProgress.has(r.projectId) : m.current === null) {
      m.current = r.title;
      m.currentNo = m.total;
      if (r.status === "in_progress") onProgress.add(r.projectId);
    }
    map.set(r.projectId, m);
  }
  return map;
}
