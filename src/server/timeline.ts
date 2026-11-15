import "server-only";
import type { Tx } from "@/server/db";
import type { EvidenceItem } from "@/server/evidence";
import { monthKey, type Precision } from "@/lib/dates";
import {
  categories,
  courseStatuses,
  enquiryStatuses,
  entryStatuses,
  experimentStatuses,
  goalHorizons,
  goalOutcomes,
  milestoneStatuses,
  participation,
  phases,
  projectStatuses,
  projectTypes,
  submissionStatuses,
  taskStatuses,
} from "@/lib/labels";

/**
 * The Timeline: one chronological feed of everything she has recorded —
 * entries, experiments, tasks, manuscripts, submissions, courses, milestones,
 * goals, projects and files. Plain server module (no React) so other callers,
 * like the ChatGPT connector, can reuse it.
 *
 * Dates keep their precision: a month-only date is never shown as a day, and
 * things without a date are returned separately (`undated`). Trash and archive
 * are left out, as everywhere else in the app. Moments that only exist as a
 * timestamp (a task ticked off, a file added) are turned into her local date.
 */

export const TIMELINE_TYPES = {
  entry: "Journal entries",
  experiment: "Experiments",
  task: "Tasks",
  manuscript: "Manuscripts and submissions",
  feedback: "Guide feedback",
  course: "Courses",
  milestone: "Milestones",
  enquiry: "Office enquiries",
  goal: "Goals",
  project: "Projects",
  file: "Files and links",
} as const;
export type TimelineType = keyof typeof TIMELINE_TYPES;

export type TimelinePeriod = "month" | "year" | "all";

export type TimelineFilters = {
  type?: string;
  project?: string;
  period?: string;
  /** Dated items to show; older ones come with "Show older". */
  limit?: number;
  /**
   * Only dated items before this day (YYYY-MM-DD), for reading further back page by page
   * (the connector's `before`). Undated items aren't returned with it — they came on the
   * first page. Not set by the app's own Timeline page.
   */
  before?: string;
  /** End a page on a whole month (the Timeline page's default). Home's short list turns it off. */
  wholeMonths?: boolean;
};

export type TimelineItem = {
  key: string;
  type: TimelineType;
  event: string;
  /** Short type label, e.g. "Task done", "Journal submission". */
  label: string;
  date: string | null;
  precision: Precision;
  title: string;
  /** Project, status and the like, already in plain words. */
  detail: string;
  href: string;
  status: string | null;
  projectId: string | null;
  /** After today (a whole month after this month for month-only dates). */
  future: boolean;
  attachments: EvidenceItem[];
};

type Raw = {
  key: string;
  type: TimelineType;
  event: string;
  date: string | null;
  precision: Precision;
  at: Date;
  title: string;
  projectId: string | null;
  projectTitle: string | null;
  status: string | null;
  info: string | null;
  href: string;
  parentType: string | null;
  parentId: string | null;
  attachmentId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** First and last day of the chosen period, or nulls for "everything". */
export function periodRange(period: TimelinePeriod, today: string): { from: string | null; to: string | null } {
  const [y, m] = today.split("-").map(Number);
  if (period === "month") {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${monthKey(today)}-01`, to: `${monthKey(today)}-${String(last).padStart(2, "0")}` };
  }
  if (period === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: null, to: null };
}

/**
 * The feed as one query. Each branch yields the same columns; the outer query
 * applies the filters, so every branch is filtered the same way.
 */
function feed(tx: Tx, tz: string) {
  const local = (col: string) => tx`(${tx.unsafe(col)} at time zone ${tz})::date`;
  return tx`
    -- journal entries, experiments, guide feedback and office enquiries (their own partial date)
    select 'entry:' || e.id as key,
           case e.kind when 'experiment' then 'experiment' when 'feedback' then 'feedback' when 'enquiry' then 'enquiry' else 'entry' end as type,
           'recorded' as event, e.entry_date as date, e.entry_precision::text as precision, e.created_at as at,
           e.title, e.project_id,
           case e.kind
             when 'experiment' then x.status
             when 'feedback' then f.resolution_status
             when 'enquiry' then q.status
             else coalesce(case when e.status in ('planned', 'postponed', 'cancelled') then e.status end,
                           nullif(ev.participation, 'unknown'))
           end as status,
           case e.kind when 'feedback' then coalesce(fm.title, f.source) when 'enquiry' then q.office else e.category end as info,
           case e.kind when 'experiment' then '/research/experiments/' else '/journal/' end || e.id as href,
           'entry' as parent_type, e.id as parent_id, null::uuid as attachment_id
    from public.entries e
    left join public.experiments x on x.entry_id = e.id
    left join public.feedback f on f.entry_id = e.id
    left join public.manuscripts fm on fm.id = f.manuscript_id
    left join public.enquiries q on q.entry_id = e.id
    left join public.events ev on ev.entry_id = e.id
    where e.deleted_at is null and e.archived_at is null

    union all -- guide feedback addressed
    select 'feedback-resolved:' || e.id, 'feedback', 'resolved', ${local("f.resolved_at")}, 'day', f.resolved_at,
           e.title, e.project_id, null, coalesce(m.title, f.source), '/journal/' || e.id, null, null, null
    from public.feedback f join public.entries e on e.id = f.entry_id
    left join public.manuscripts m on m.id = f.manuscript_id
    where f.resolution_status = 'resolved' and f.resolved_at is not null and e.deleted_at is null and e.archived_at is null

    union all -- office enquiry closed
    select 'enquiry-closed:' || e.id, 'enquiry', 'closed', ${local("q.closed_at")}, 'day', q.closed_at,
           e.title, e.project_id, null, q.office, '/journal/' || e.id, null, null, null
    from public.enquiries q join public.entries e on e.id = q.entry_id
    where q.status = 'closed' and q.closed_at is not null and e.deleted_at is null and e.archived_at is null

    union all -- office enquiry: follow up
    select 'enquiry-follow-up:' || e.id, 'enquiry', 'follow_up', q.follow_up_date, 'day', e.created_at,
           e.title, e.project_id, q.status, q.office, '/journal/' || e.id, null, null, null
    from public.enquiries q join public.entries e on e.id = q.entry_id
    where q.status <> 'closed' and q.follow_up_date is not null and e.deleted_at is null and e.archived_at is null

    union all -- task added
    select 'task-added:' || t.id, 'task', 'added', ${local("t.created_at")}, 'day', t.created_at,
           t.title, t.project_id, t.status, null,
           case when t.status in ('done', 'cancelled') then '/planner?show=done' else '/planner' end, null, null, null
    from public.tasks t where t.deleted_at is null and t.archived_at is null

    union all -- task done
    select 'task-done:' || t.id, 'task', 'done', ${local("t.completed_at")}, 'day', t.completed_at,
           t.title, t.project_id, t.status, null, '/planner?show=done', null, null, null
    from public.tasks t
    where t.deleted_at is null and t.archived_at is null and t.status = 'done' and t.completed_at is not null

    union all -- task due (still open)
    select 'task-due:' || t.id, 'task', 'due', t.due_date, 'day', t.created_at,
           t.title, t.project_id, t.status, null,
           case when t.status = 'waiting' then '/planner?show=waiting' else '/planner' end, null, null, null
    from public.tasks t
    where t.deleted_at is null and t.archived_at is null and t.due_date is not null and t.status not in ('done', 'cancelled')

    union all -- manuscript added
    select 'manuscript-added:' || m.id, 'manuscript', 'added', ${local("m.created_at")}, 'day', m.created_at,
           m.title, m.project_id, m.current_phase, null, '/research/manuscripts/' || m.id, 'manuscript', m.id, null
    from public.manuscripts m where m.deleted_at is null and m.archived_at is null

    union all -- manuscript phase changes (the automatic "Planning" at creation is covered by "added")
    select 'phase:' || pe.id, 'manuscript', 'phase', pe.effective_date, pe.effective_precision::text, pe.recorded_at,
           m.title, m.project_id, pe.kind, pe.phase, '/research/manuscripts/' || m.id, null, null, null
    from public.manuscript_phase_events pe join public.manuscripts m on m.id = pe.manuscript_id
    where m.deleted_at is null and m.archived_at is null
      and not (pe.kind = 'change' and pe.phase = 'planning' and pe.effective_precision = 'none' and pe.note is null
               and pe.recorded_at < m.created_at + interval '1 minute')

    union all -- journal submission sent
    select 'submission:' || s.id, 'manuscript', 'submitted', s.submitted_date, s.submitted_precision::text, s.created_at,
           m.title, m.project_id, s.status, s.journal_name, '/research/manuscripts/' || m.id, null, null, null
    from public.submissions s join public.manuscripts m on m.id = s.manuscript_id
    where m.deleted_at is null and m.archived_at is null and s.status <> 'planned'

    union all -- journal submission planned
    select 'submission-planned:' || s.id, 'manuscript', 'planned', s.planned_date,
           case when s.planned_date is null then 'none' else 'day' end, s.created_at,
           m.title, m.project_id, s.status, s.journal_name, '/research/manuscripts/' || m.id, null, null, null
    from public.submissions s join public.manuscripts m on m.id = s.manuscript_id
    where m.deleted_at is null and m.archived_at is null and s.status = 'planned'

    union all -- journal decision
    select 'decision:' || s.id, 'manuscript', 'decision', s.decision_date, 'day', coalesce(s.closed_at, s.updated_at),
           m.title, m.project_id, s.status, s.journal_name, '/research/manuscripts/' || m.id, null, null, null
    from public.submissions s join public.manuscripts m on m.id = s.manuscript_id
    where m.deleted_at is null and m.archived_at is null and s.decision_date is not null
      and s.status in ('revise', 'rejected', 'accepted', 'withdrawn')

    union all -- course added
    select 'course-added:' || c.id, 'course', 'added', ${local("c.created_at")}, 'day', c.created_at,
           c.name, null, c.status, c.provider, '/academics', 'course', c.id, null
    from public.courses c where c.deleted_at is null and c.archived_at is null

    union all -- course completed
    select 'course-completed:' || c.id, 'course', 'completed', c.completed_on, 'day', c.updated_at,
           c.name, null, c.status, c.provider, '/academics', null, null, null
    from public.courses c where c.deleted_at is null and c.archived_at is null and c.completed_on is not null

    union all -- credits officially recognised
    select 'recognised:' || r.id, 'course', 'recognised', r.recognised_on, r.recognised_precision::text, r.created_at,
           c.name, null, null, r.amount::text, '/academics', null, null, null
    from public.credit_recognitions r join public.courses c on c.id = r.course_id
    where c.deleted_at is null and c.archived_at is null

    union all -- milestones: when reached, or when planned
    select 'milestone:' || ml.id, 'milestone', case when ml.status = 'done' then 'reached' else 'target' end,
           case when ml.status = 'done' then ml.done_on else ml.target_date end,
           (case when ml.status = 'done' then ml.done_precision else ml.target_precision end)::text, ml.created_at,
           ml.title, ml.project_id, ml.status, null, '/academics#milestones', 'milestone', ml.id, null
    from public.milestones ml

    union all -- goals, from the start of their period
    select 'goal:' || g.id, 'goal', 'set', coalesce(g.period_start, ${local("g.created_at")}), 'day', g.created_at,
           g.title, null, g.outcome, g.horizon, '/planner?view=goals', null, null, null
    from public.goals g where g.deleted_at is null

    union all -- project started (its own start date) or added
    select 'project:' || p.id, 'project', case when p.start_precision = 'none' then 'added' else 'started' end,
           case when p.start_precision = 'none' then ${local("p.created_at")} else p.start_date end,
           case when p.start_precision = 'none' then 'day' else p.start_precision::text end, p.created_at,
           p.title, p.id, p.status, p.type, '/research/projects/' || p.id, 'project', p.id, null
    from public.projects p where p.deleted_at is null and p.archived_at is null

    union all -- project target date
    select 'project-target:' || p.id, 'project', 'target', p.target_date, p.target_precision::text, p.created_at,
           p.title, p.id, p.status, p.type, '/research/projects/' || p.id, null, null, null
    from public.projects p
    where p.deleted_at is null and p.archived_at is null and p.target_precision <> 'none' and p.status <> 'completed'

    union all -- experiment trial run (its files are shown on it)
    select 'trial:' || t.id, 'experiment', 'trial', t.run_on, case when t.run_on is null then 'none' else 'day' end, t.created_at,
           e.title, e.project_id, t.outcome, t.trial_no::text, '/research/experiments/' || e.id, 'trial', t.id, null
    from public.experiment_trials t join public.entries e on e.id = t.entry_id
    where t.removed_at is null and e.deleted_at is null and e.archived_at is null

    union all -- review step done
    select 'review-step:' || s.id, 'project', 'step', s.done_on, 'day', s.updated_at,
           s.title, p.id, s.status, null, '/research/projects/' || p.id || '#progress', null, null, null
    from public.review_steps s join public.projects p on p.id = s.project_id
    where s.removed_at is null and s.status = 'done' and s.done_on is not null
      and p.deleted_at is null and p.archived_at is null

    union all -- course deadline: when it's due (open), or when it was done
    select 'deadline:' || i.id, 'course', case when i.done_at is null then 'deadline' else 'deadline_done' end,
           case when i.done_at is null then i.due_date else ${local("i.done_at")} end,
           case when i.done_at is null and i.due_date is null then 'none' else 'day' end, i.created_at,
           i.title, null, i.kind, c.name, '/academics#courses', null, null, null
    from public.course_items i join public.courses c on c.id = i.course_id
    where i.removed_at is null and c.deleted_at is null and c.archived_at is null

    union all -- files and links added later (ones added with the record are shown on the record itself)
    select 'file:' || a.id, 'file', a.kind, ${local("a.created_at")}, 'day', a.created_at,
           coalesce(a.label, a.filename, a.url, 'File'),
           coalesce(pe.project_id, pp.id, pm.project_id, pl.project_id), null,
           coalesce(pe.title, pp.title, pm.title, pc.name, pl.title),
           case a.parent_type
             when 'entry' then case pe.kind when 'experiment' then '/research/experiments/' else '/journal/' end || pe.id
             when 'project' then '/research/projects/' || pp.id
             when 'manuscript' then '/research/manuscripts/' || pm.id
             when 'milestone' then '/academics#milestones'
             else '/academics'
           end,
           null, null, a.id
    from public.attachments a
    left join public.entries pe on a.parent_type = 'entry' and pe.id = a.parent_id
    left join public.projects pp on a.parent_type = 'project' and pp.id = a.parent_id
    left join public.manuscripts pm on a.parent_type = 'manuscript' and pm.id = a.parent_id
    left join public.courses pc on a.parent_type = 'course' and pc.id = a.parent_id
    left join public.milestones pl on a.parent_type = 'milestone' and pl.id = a.parent_id
    where a.removed_at is null and a.replaced_by_id is null and a.status = 'verified'
      and case a.parent_type
            when 'entry' then pe.deleted_at is null and pe.archived_at is null and pe.id is not null
            when 'project' then pp.deleted_at is null and pp.archived_at is null and pp.id is not null
            when 'manuscript' then pm.deleted_at is null and pm.archived_at is null and pm.id is not null
            when 'course' then pc.deleted_at is null and pc.archived_at is null and pc.id is not null
            when 'milestone' then pl.id is not null
          end
      and ${local("a.created_at")} <> ${local("coalesce(pe.created_at, pp.created_at, pm.created_at, pc.created_at, pl.created_at)")}
  `;
}

export async function getTimeline(tx: Tx, f: TimelineFilters & { today: string; timezone: string }) {
  const type = f.type && f.type in TIMELINE_TYPES ? (f.type as TimelineType) : null;
  const project = f.project && UUID.test(f.project) ? f.project : null;
  const period: TimelinePeriod = f.period === "month" || f.period === "year" ? f.period : "all";
  const { from, to } = periodRange(period, f.today);
  const limit = Math.min(Math.max(f.limit ?? 150, 50), 5000);
  const before = f.before && /^\d{4}-\d{2}-\d{2}$/.test(f.before) ? f.before : null;

  const select = (dated: boolean) => tx<Raw[]>`
    select i.*, p.title as project_title
    from (${feed(tx, f.timezone)}) i
    left join public.projects p on p.id = i.project_id
    where ${dated ? tx`i.date is not null and i.precision <> 'none'` : tx`(i.date is null or i.precision = 'none')`}
      and (${type}::text is null or i.type = ${type})
      and (${project}::uuid is null or i.project_id = ${project})
      and (${from}::date is null or i.date >= ${from})
      and (${to}::date is null or i.date <= ${to})
      and (${before}::date is null or i.date < ${before})
    order by ${dated ? tx`i.date desc, (i.precision = 'month'), i.at desc, i.key` : tx`i.at desc, i.key`}
    limit ${dated ? limit + 1 : 500}`;

  let dated: Raw[] = await select(true);
  const hasOlder = dated.length > limit;
  if (hasOlder && f.wholeMonths !== false) {
    dated = dated.slice(0, limit);
    // Don't show half a month: end the page at the last complete month, when there is one.
    const lastMonth = monthKey(dated[dated.length - 1].date!);
    const complete = dated.filter((r) => monthKey(r.date!) !== lastMonth);
    if (complete.length > 0) dated = complete;
  }
  // Undated things can't fall inside a period, so they're only shown for "everything".
  const undated = period === "all" && !before ? await select(false) : [];

  const attachments = await attachmentsFor(tx, [...dated, ...undated]);
  const toItem = (r: Raw): TimelineItem => {
    const future = isAfter(r.date, r.precision, f.today);
    // a future item already carries a "Planned" mark, so don't repeat it in the detail
    const { label, detail } = describe(future && r.status === "planned" ? { ...r, status: null } : r);
    return {
      key: r.key,
      type: r.type,
      event: r.event,
      label,
      date: r.precision === "none" ? null : r.date,
      precision: r.date ? r.precision : "none",
      title: r.title,
      detail,
      href: r.href,
      status: r.status,
      projectId: r.projectId,
      future,
      attachments: r.attachmentId
        ? attachments.byId.get(r.attachmentId) ?? []
        : r.parentType && r.parentId
          ? attachments.byParent.get(`${r.parentType}:${r.parentId}`) ?? []
          : [],
    };
  };

  return { dated: dated.map(toItem), undated: undated.map(toItem), hasOlder, limit, period, type, project };
}

function isAfter(date: string | null, precision: Precision, today: string) {
  if (!date || precision === "none") return false;
  return precision === "month" ? monthKey(date) > monthKey(today) : date > today;
}

async function attachmentsFor(tx: Tx, rows: Raw[]) {
  const parents = rows.filter((r) => r.parentType && r.parentId).map((r) => r.parentId!);
  const ids = rows.filter((r) => r.attachmentId).map((r) => r.attachmentId!);
  const byParent = new Map<string, EvidenceItem[]>();
  const byId = new Map<string, EvidenceItem[]>();
  if (parents.length === 0 && ids.length === 0) return { byParent, byId };
  const found = await tx<(EvidenceItem & { parentType: string; parentId: string })[]>`
    select id, kind, url, label, filename, size_bytes::int as size_bytes, mime_type, parent_type, parent_id
    from public.attachments
    where (parent_id = any(${parents}::uuid[]) or id = any(${ids}::uuid[]))
      and removed_at is null and replaced_by_id is null and status = 'verified'
    order by created_at`;
  for (const { parentType, parentId, ...a } of found) {
    const k = `${parentType}:${parentId}`;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(a);
    byId.set(a.id, [a]);
  }
  return { byParent, byId };
}

/** "SLR 1: Electrochemical…" → "SLR 1" when the title has a short prefix. */
function short(title: string | null) {
  if (!title) return null;
  const i = title.indexOf(":");
  return i > 0 && i <= 12 ? title.slice(0, i) : title;
}

function pick<T extends Record<string, string>>(labels: T, key: string | null) {
  return key && key in labels ? labels[key as keyof T] : null;
}

const TRIAL_OUTCOMES = { worked: "Worked", did_not_work: "Didn't work", inconclusive: "Inconclusive" };
const DEADLINE_DUE = { assignment: "Assignment due", exam_registration: "Exam registration closes", exam: "Exam" };
const DEADLINE_DONE = { assignment: "Assignment submitted", exam_registration: "Registered for the exam", exam: "Exam done" };

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

function credits(n: string | null) {
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, "")} ${v === 1 ? "credit" : "credits"}`;
}

/** Type label and one line of detail, in the same words the rest of the app uses. */
export function describe(r: Pick<Raw, "type" | "event" | "status" | "info" | "projectTitle">): { label: string; detail: string } {
  const project = short(r.projectTitle);
  switch (r.type) {
    case "entry":
      return {
        label: "Journal entry",
        detail: join(pick(categories, r.info), project, pick(entryStatuses, r.status) ?? pick(participation, r.status)),
      };
    case "experiment":
      if (r.event === "trial") return { label: `Trial ${r.info}`, detail: join(project, pick(TRIAL_OUTCOMES, r.status)) };
      return { label: "Experiment", detail: join(project, pick(experimentStatuses, r.status)) };
    case "feedback":
      if (r.event === "resolved") return { label: "Feedback addressed", detail: join(r.info, project) };
      return { label: "Guide feedback", detail: join(r.info, project, r.status === "resolved" ? "Addressed" : "Open") };
    case "enquiry":
      if (r.event === "closed") return { label: "Enquiry closed", detail: join(r.info) };
      if (r.event === "follow_up") return { label: "Follow up", detail: join(r.info, pick(enquiryStatuses, r.status)) };
      return { label: "Office enquiry", detail: join(r.info, pick(enquiryStatuses, r.status)) };
    case "task":
      if (r.event === "done") return { label: "Task done", detail: join(project) };
      if (r.event === "due") return { label: "Task due", detail: join(project, pick(taskStatuses, r.status)) };
      return { label: "Task added", detail: join(project, pick(taskStatuses, r.status)) };
    case "manuscript":
      if (r.event === "phase")
        return { label: "Manuscript", detail: join(`Moved to ${pick(phases, r.info) ?? r.info}`, r.status === "earlier_change" && "recorded later", project) };
      if (r.event === "submitted")
        return { label: "Journal submission", detail: join(`Submitted to ${r.info}`, pick(submissionStatuses, r.status), project) };
      if (r.event === "planned") return { label: "Planned submission", detail: join(`To ${r.info}`, project) };
      if (r.event === "decision") return { label: "Journal decision", detail: join(`${r.info}: ${pick(submissionStatuses, r.status)}`, project) };
      return { label: "Manuscript added", detail: join(project, pick(phases, r.status)) };
    case "course":
      if (r.event === "completed") return { label: "Course completed", detail: join(r.info) };
      if (r.event === "recognised") return { label: "Credits recognised", detail: `${credits(r.info)} officially recognised` };
      if (r.event === "deadline") return { label: pick(DEADLINE_DUE, r.status) ?? "Course deadline", detail: join(r.info) };
      if (r.event === "deadline_done") return { label: pick(DEADLINE_DONE, r.status) ?? "Course deadline done", detail: join(r.info) };
      return { label: "Course added", detail: join(r.info, pick(courseStatuses, r.status)) };
    case "milestone":
      return r.event === "reached"
        ? { label: "Milestone reached", detail: join(project) }
        : { label: "Milestone", detail: join(pick(milestoneStatuses, r.status), project) };
    case "goal":
      return { label: "Goal", detail: join(pick(goalHorizons, r.info), pick(goalOutcomes, r.status)) };
    case "project":
      if (r.event === "target") return { label: "Project target", detail: join(pick(projectStatuses, r.status)) };
      if (r.event === "step") return { label: "Review step done", detail: join(project) };
      return { label: r.event === "started" ? "Project started" : "Project added", detail: join(pick(projectTypes, r.info), pick(projectStatuses, r.status)) };
    case "file":
      return { label: r.event === "link" ? "Link added" : "File added", detail: r.info ? `On ${r.info}` : "" };
  }
}

/**
 * The "big moments" the Timeline's Highlights view keeps: a milestone reached, a paper
 * submitted or decided, a course completed or recognised, a project started or a review
 * step done. Everything else is everyday work.
 */
const HIGHLIGHTS: Partial<Record<TimelineType, readonly string[]>> = {
  milestone: ["reached"],
  manuscript: ["submitted", "decision"],
  course: ["completed", "recognised"],
  project: ["started", "step"],
};

export function isHighlight(it: Pick<TimelineItem, "type" | "event">) {
  return HIGHLIGHTS[it.type]?.includes(it.event) ?? false;
}

export type TimelineSummary = {
  /** Dated things up to today (planned ones aren't counted until they happen). */
  total: number;
  highlights: number;
  /** Months that have at least one record. */
  activeMonths: number;
  /** Records per month (YYYY-MM → count), up to today. */
  byMonth: Map<string, number>;
};

/**
 * Real totals for the Timeline's summary card, counted in the database (not from the
 * page that's loaded), with the same type and project filters as the feed.
 */
export async function getTimelineSummary(tx: Tx, f: { type?: string | null; project?: string | null; today: string; timezone: string }): Promise<TimelineSummary> {
  const type = f.type && f.type in TIMELINE_TYPES ? (f.type as TimelineType) : null;
  const project = f.project && UUID.test(f.project) ? f.project : null;
  const rows = await tx<{ month: string; type: TimelineType; event: string; n: number }[]>`
    select to_char(i.date, 'YYYY-MM') as month, i.type, i.event, count(*)::int as n
    from (${feed(tx, f.timezone)}) i
    where i.date is not null and i.precision <> 'none'
      and (case when i.precision = 'month' then to_char(i.date, 'YYYY-MM') <= ${monthKey(f.today)} else i.date <= ${f.today} end)
      and (${type}::text is null or i.type = ${type})
      and (${project}::uuid is null or i.project_id = ${project})
    group by 1, 2, 3`;
  const byMonth = new Map<string, number>();
  let total = 0;
  let highlights = 0;
  for (const r of rows) {
    total += r.n;
    if (isHighlight(r)) highlights += r.n;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.n);
  }
  return { total, highlights, activeMonths: byMonth.size, byMonth };
}
