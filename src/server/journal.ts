import "server-only";
import type { Tx } from "@/server/db";
import type { Precision } from "@/lib/dates";
import { evidenceFor, type EvidenceItem } from "@/server/evidence";

export type JournalRow = {
  id: string;
  title: string;
  kind: string;
  category: string | null;
  status: string | null;
  entryDate: string | null;
  entryPrecision: Precision;
  dateFrom: string | null;
  dateTo: string | null;
  projectId: string | null;
  projectTitle: string | null;
  registration: string | null;
  participation: string | null;
  award: string | null;
  experimentStatus: string | null;
};

export type JournalFilters = {
  q?: string;
  category?: string;
  status?: string;
  project?: string;
  from?: string; // YYYY-MM
  to?: string; // YYYY-MM
  limit?: number; // dated entries to show (older ones via "Show older")
};

function endOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export async function getJournal(tx: Tx, f: JournalFilters) {
  const q = f.q?.trim() || null;
  const like = q ? `%${q}%` : null;
  const from = f.from && /^\d{4}-\d{2}$/.test(f.from) ? `${f.from}-01` : null;
  const to = f.to && /^\d{4}-\d{2}$/.test(f.to) ? endOfMonth(f.to) : null;
  const limit = Math.min(Math.max(f.limit ?? 200, 50), 5000);

  const base = (dated: boolean) => tx<JournalRow[]>`
    select e.id, e.title, e.kind, e.category, e.status, e.entry_date, e.entry_precision, e.date_from, e.date_to,
           e.project_id, p.title as project_title,
           ev.registration, ev.participation, ev.award, x.status as experiment_status
    from public.entries e
    left join public.projects p on p.id = e.project_id
    left join public.events ev on ev.entry_id = e.id
    left join public.experiments x on x.entry_id = e.id
    where e.deleted_at is null and e.archived_at is null
      and ${dated ? tx`e.entry_precision <> 'none'` : tx`e.entry_precision = 'none'`}
      and (${q}::text is null
           or e.search @@ websearch_to_tsquery('english', ${q})
           or e.title ilike ${like} or e.description ilike ${like} or e.people ilike ${like} or e.outcome ilike ${like}
           or exists (select 1 from public.experiments ex where ex.entry_id = e.id and
                      concat_ws(' ', ex.objective, ex.materials, ex.procedure, ex.observations, ex.interpretation, ex.outcome) ilike ${like})
           or exists (select 1 from public.feedback fb where fb.entry_id = e.id and
                      concat_ws(' ', fb.source, fb.requested_changes, fb.resolution_note) ilike ${like})
           or exists (select 1 from public.enquiries en where en.entry_id = e.id and
                      concat_ws(' ', en.office, en.contact, en.response) ilike ${like})
           or ev.award ilike ${like} or ev.organiser ilike ${like})
      and (${f.category ?? null}::text is null or e.category = ${f.category ?? null})
      and (${f.status ?? null}::text is null or e.status = ${f.status ?? null})
      and (${f.project ?? null}::uuid is null or e.project_id = ${f.project ?? null})
      and (${from}::date is null or e.date_to >= ${from})
      and (${to}::date is null or e.date_from <= ${to})
    order by e.date_from desc nulls last, (e.entry_precision = 'month'), e.entry_date desc, e.created_at desc
    limit ${dated ? limit + 1 : 1000}`;

  const datedPlusOne = await base(true);
  const hasOlder = datedPlusOne.length > limit;
  const dated = datedPlusOne.slice(0, limit);
  // Undated entries can't match a date-range filter, so they're hidden when one is set.
  const undated = from || to ? [] : await base(false);

  // An entry only partly inside the selected period (e.g. "January, day not known"
  // against a range that ends mid-month) is labelled rather than silently counted.
  const partial = new Set(
    dated
      .filter((e) => (from && e.dateFrom! < from) || (to && e.dateTo! > to))
      .map((e) => e.id),
  );

  let otherMatches: { kind: string; title: string; href: string }[] = [];
  if (like) {
    otherMatches = await tx<{ kind: string; title: string; href: string }[]>`
      select 'Project' as kind, title, '/research/projects/' || id as href from public.projects where deleted_at is null and (title ilike ${like} or objective ilike ${like})
      union all
      select 'Manuscript', title, '/research/manuscripts/' || id from public.manuscripts where deleted_at is null and title ilike ${like}
      union all
      select 'Journal submission', s.journal_name || ' — ' || m.title, '/research/manuscripts/' || m.id
        from public.submissions s join public.manuscripts m on m.id = s.manuscript_id where s.journal_name ilike ${like}
      union all
      select 'Task', title, '/planner' from public.tasks where deleted_at is null and (title ilike ${like} or notes ilike ${like})
      union all
      select 'Course', name, '/academics' from public.courses where deleted_at is null and (name ilike ${like} or provider ilike ${like})
      limit 12`;
  }

  return { dated, undated, partial, otherMatches, hasOlder, limit };
}

export type EntryDetail = {
  id: string;
  title: string;
  kind: string;
  category: string | null;
  status: string | null;
  entryDate: string | null;
  entryPrecision: Precision;
  description: string | null;
  people: string | null;
  outcome: string | null;
  skillsLearned: string | null;
  projectId: string | null;
  createdVia: string;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  event: {
    organiser: string | null;
    location: string | null;
    registration: string | null;
    participation: string;
    presentationTitle: string | null;
    award: string | null;
    submissionOutcome: string | null;
  } | null;
  feedback: {
    manuscriptId: string | null;
    source: string | null;
    receivedVia: string | null;
    requestedChanges: string | null;
    resolutionStatus: string;
    resolutionNote: string | null;
  } | null;
  enquiry: { office: string | null; contact: string | null; response: string | null; followUpDate: string | null; status: string } | null;
  hasExperiment: boolean;
  tasks: { id: string; title: string; status: string }[];
  evidence: EvidenceItem[];
};

export async function getEntry(tx: Tx, id: string): Promise<EntryDetail | null> {
  const [e] = await tx`select * from public.entries where id = ${id} and deleted_at is null`;
  if (!e) return null;
  const [event] = await tx`select organiser, location, registration, participation, presentation_title, award, submission_outcome from public.events where entry_id = ${id}`;
  const [feedback] = await tx`select manuscript_id, source, received_via, requested_changes, resolution_status, resolution_note from public.feedback where entry_id = ${id}`;
  const [enquiry] = await tx`select office, contact, response, follow_up_date, status from public.enquiries where entry_id = ${id}`;
  const [exp] = await tx`select 1 from public.experiments where entry_id = ${id}`;
  const tasks = await tx`select id, title, status from public.tasks where origin_entry_id = ${id} and deleted_at is null order by created_at`;
  const evidence = await evidenceFor(tx, "entry", id);
  return {
    ...(e as unknown as EntryDetail),
    event: (event as EntryDetail["event"]) ?? null,
    feedback: (feedback as EntryDetail["feedback"]) ?? null,
    enquiry: (enquiry as EntryDetail["enquiry"]) ?? null,
    hasExperiment: Boolean(exp),
    tasks: tasks as unknown as EntryDetail["tasks"],
    evidence,
  };
}
