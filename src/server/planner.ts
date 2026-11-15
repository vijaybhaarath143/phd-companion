import "server-only";
import type { Tx } from "@/server/db";
import { isMonthKey, type Precision } from "@/lib/dates";
import type { TaskPriority } from "@/lib/labels";

export type TaskRow = {
  id: string;
  title: string;
  status: "todo" | "doing" | "waiting" | "done" | "cancelled";
  priority: TaskPriority;
  remindUntilDone: boolean;
  dueDate: string | null;
  notes: string | null;
  waitingReason: string | null;
  waitingOnTaskId: string | null;
  waitingOnTitle: string | null;
  manuscriptId: string | null;
  manuscriptTitle: string | null;
  originEntryId: string | null;
  originTitle: string | null;
  courseName: string | null;
  completedAt: Date | null;
  createdVia: string;
  changedVia: string | null;
  version: number;
};

/** `limit` rows at most (the Planner asks for one more than it shows, to offer "Show more"). */
/** Overdue first, then High → Normal → Low, then by due date. */
export async function listTasks(tx: Tx, show: "open" | "waiting" | "done", limit = 300, today?: string) {
  const max = Math.min(Math.max(Math.trunc(limit) || 300, 1), 5001);
  const statusFilter =
    show === "done" ? tx`t.status in ('done', 'cancelled')` : show === "waiting" ? tx`t.status = 'waiting'` : tx`t.status in ('todo', 'doing', 'waiting')`;
  return tx<TaskRow[]>`
    select t.*, p.title as manuscript_title, w.title as waiting_on_title, e.title as origin_title, c.name as course_name
    from public.tasks t
    left join public.manuscripts p on p.id = t.manuscript_id
    left join public.tasks w on w.id = t.waiting_on_task_id
    left join public.entries e on e.id = t.origin_entry_id
    left join public.courses c on c.id = t.course_id
    where t.deleted_at is null and ${statusFilter}
    order by ${show === "done" ? tx`t.completed_at desc nulls last, t.updated_at desc` : tx`(t.status = 'waiting'), coalesce(t.due_date < ${today ?? '0001-01-01'}, false) desc, case t.priority when 'high' then 0 when 'normal' then 1 else 2 end, t.due_date nulls last, t.created_at`}
    limit ${max}`;
}

export async function taskCounts(tx: Tx) {
  const [c] = await tx<{ open: number; waiting: number }[]>`
    select count(*) filter (where status in ('todo','doing','waiting'))::int as open,
           count(*) filter (where status = 'waiting')::int as waiting
    from public.tasks where deleted_at is null`;
  return c;
}

export type CalendarItem = { date: string; title: string; href: string; kind: "task" | "entry" | "milestone" | "follow-up" | "submission" | "deadline" };

/** Items with an exact date in the month, plus month-only items (shown separately). Undated items are excluded. */
export async function getCalendar(tx: Tx, monthKey: string, today?: string) {
  // a bad month in the URL shows this month, never an error page
  const month = isMonthKey(monthKey) ? monthKey : (today ?? new Date().toISOString()).slice(0, 7);
  const start = `${month}-01`;
  const exact = await tx<CalendarItem[]>`
    select due_date as date, title, '/planner' as href, 'task' as kind from public.tasks
      where deleted_at is null and status not in ('cancelled') and to_char(due_date, 'YYYY-MM') = ${month}
    union all
    select entry_date, title, '/journal/' || id, 'entry' from public.entries
      where deleted_at is null and entry_precision = 'day' and to_char(entry_date, 'YYYY-MM') = ${month}
        and coalesce(status, '') <> 'cancelled'
    union all
    select target_date, title, '/academics', 'milestone' from public.milestones
      where target_precision = 'day' and to_char(target_date, 'YYYY-MM') = ${month}
    union all
    select q.follow_up_date, 'Follow up: ' || e.title, '/academics#enquiries', 'follow-up'
      from public.enquiries q join public.entries e on e.id = q.entry_id
      where q.status <> 'closed' and to_char(q.follow_up_date, 'YYYY-MM') = ${month}
    union all
    select i.due_date, c.name || ': ' || i.title, '/academics#courses', 'deadline'
      from public.course_items i join public.courses c on c.id = i.course_id
      where i.removed_at is null and c.deleted_at is null and c.status <> 'dropped' and to_char(i.due_date, 'YYYY-MM') = ${month}
    union all
    select s.planned_date, 'Planned submission: ' || s.journal_name, '/research/manuscripts/' || s.manuscript_id, 'submission'
      from public.submissions s where to_char(s.planned_date, 'YYYY-MM') = ${month}
        and not exists (select 1 from public.tasks t where t.manuscript_id = s.manuscript_id and t.due_date = s.planned_date and t.deleted_at is null)
    order by 1`;
  const monthOnly = await tx<{ title: string; href: string }[]>`
    select title, '/journal/' || id as href from public.entries
      where deleted_at is null and entry_precision = 'month' and entry_date = ${start}
    union all
    select title, '/academics' from public.milestones where target_precision = 'month' and target_date = ${start}`;
  const [next] = await tx<{ title: string; date: string; precision: Precision; href: string }[]>`
    select title, entry_date as date, entry_precision as precision, '/journal/' || id as href from public.entries
    where deleted_at is null and entry_precision <> 'none' and date_from > (${start}::date + interval '1 month' - interval '1 day')
      and coalesce(status, '') <> 'cancelled'
    order by date_from limit 1`;
  return { exact, monthOnly, next: next ?? null };
}

export type GoalRow = { id: string; title: string; horizon: string; periodStart: string | null; periodEnd: string | null; outcome: string; version: number };

export async function listGoals(tx: Tx) {
  return tx<GoalRow[]>`
    select * from public.goals
    where deleted_at is null
    order by (outcome <> 'open'), period_start desc nulls last, created_at desc`;
}

export async function openTaskOptions(tx: Tx) {
  return tx<{ id: string; title: string }[]>`
    select id, title from public.tasks where deleted_at is null and status not in ('done','cancelled') order by created_at`;
}
