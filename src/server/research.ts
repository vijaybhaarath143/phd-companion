import "server-only";
import type { Tx } from "@/server/db";
import type { Precision } from "@/lib/dates";
import type { Phase } from "@/lib/labels";
import { evidenceFor } from "@/server/evidence";

export type ProjectRow = {
  id: string;
  title: string;
  type: string | null;
  status: string;
  objective: string | null;
  description: string | null;
  startDate: string | null;
  startPrecision: Precision;
  targetDate: string | null;
  targetPrecision: Precision;
  version: number;
};

export async function listProjects(tx: Tx) {
  return tx<{ id: string; title: string; status: string }[]>`
    select id, title, status from public.projects
    where deleted_at is null and archived_at is null order by created_at`;
}

export async function getProjectBundle(tx: Tx, id: string) {
  const [project] = await tx<ProjectRow[]>`select * from public.projects where id = ${id} and deleted_at is null`;
  if (!project) return null;
  const manuscripts = await tx<{ id: string; title: string; currentPhase: Phase; openFeedback: number; waiting: number }[]>`
    select m.id, m.title, m.current_phase,
      (select count(*)::int from public.feedback f join public.entries e on e.id = f.entry_id
        where f.manuscript_id = m.id and f.resolution_status = 'open' and e.deleted_at is null) as open_feedback,
      (select count(*)::int from public.tasks t where t.manuscript_id = m.id and t.status = 'waiting' and t.deleted_at is null) as waiting
    from public.manuscripts m where m.project_id = ${id} and m.deleted_at is null order by m.created_at`;
  const experiments = await tx<{ id: string; title: string; status: string | null; entryDate: string | null; entryPrecision: Precision }[]>`
    select e.id, e.title, x.status, e.entry_date, e.entry_precision
    from public.entries e join public.experiments x on x.entry_id = e.id
    where e.project_id = ${id} and e.deleted_at is null order by e.created_at desc`;
  const tasks = await tx<{ id: string; title: string; status: string; dueDate: string | null; waitingReason: string | null }[]>`
    select id, title, status, due_date, waiting_reason from public.tasks
    where project_id = ${id} and deleted_at is null and status not in ('done', 'cancelled')
    order by (status = 'waiting'), due_date nulls last, created_at`;
  const entries = await tx<{ id: string; title: string; entryDate: string | null; entryPrecision: Precision; category: string | null }[]>`
    select id, title, entry_date, entry_precision, category from public.entries
    where project_id = ${id} and deleted_at is null and archived_at is null and kind <> 'experiment'
    order by date_from desc nulls last, created_at desc limit 8`;
  const evidence = await evidenceFor(tx, "project", id);
  const milestones = await tx<{ id: string; title: string; status: string; targetDate: string | null; targetPrecision: Precision }[]>`
    select id, title, status, target_date, target_precision from public.milestones where project_id = ${id} order by sort, created_at`;
  return { project, manuscripts, experiments, tasks, entries, evidence, milestones };
}

export async function getManuscriptBundle(tx: Tx, id: string) {
  const [manuscript] = await tx<{
    id: string; title: string; projectId: string | null; currentPhase: Phase; stoppedReason: string | null;
    doi: string | null; authors: string | null; articleType: string | null; version: number;
  }[]>`select * from public.manuscripts where id = ${id} and deleted_at is null`;
  if (!manuscript) return null;
  const [project] = manuscript.projectId
    ? await tx<{ id: string; title: string }[]>`select id, title from public.projects where id = ${manuscript.projectId}`
    : [null];
  const history = await tx<{ id: string; phase: Phase; effectiveDate: string | null; effectivePrecision: Precision; recordedAt: Date; kind: string; note: string | null; createdVia: string }[]>`
    select id, phase, effective_date, effective_precision, recorded_at, kind, note, created_via
    from public.manuscript_phase_events where manuscript_id = ${id}
    order by coalesce(effective_date, recorded_at::date) desc, recorded_at desc`;
  const submissions = await tx<{
    id: string; attemptNo: number; journalName: string; manuscriptRef: string | null; submittedDate: string | null;
    submittedPrecision: Precision; status: string; decisionDate: string | null; closedAt: Date | null; notes: string | null;
  }[]>`select * from public.submissions where manuscript_id = ${id} order by attempt_no desc`;
  const feedback = await tx<{ entryId: string; title: string; source: string | null; requestedChanges: string | null; resolutionStatus: string; entryDate: string | null; entryPrecision: Precision; taskCount: number }[]>`
    select f.entry_id, e.title, f.source, f.requested_changes, f.resolution_status, e.entry_date, e.entry_precision,
      (select count(*)::int from public.tasks t where t.origin_entry_id = e.id and t.deleted_at is null) as task_count
    from public.feedback f join public.entries e on e.id = f.entry_id
    where f.manuscript_id = ${id} and e.deleted_at is null
    order by (f.resolution_status = 'resolved'), e.created_at desc`;
  const waitingTasks = await tx<{ id: string; title: string; waitingReason: string | null }[]>`
    select id, title, waiting_reason from public.tasks where manuscript_id = ${id} and status = 'waiting' and deleted_at is null`;
  return { manuscript, project, history, submissions, feedback, waitingTasks };
}

export async function getExperimentBundle(tx: Tx, id: string) {
  const [entry] = await tx<{ id: string; title: string; entryDate: string | null; entryPrecision: Precision; projectId: string | null; version: number }[]>`
    select id, title, entry_date, entry_precision, project_id, version from public.entries where id = ${id} and deleted_at is null`;
  if (!entry) return null;
  const [experiment] = await tx<{
    status: string | null; objective: string | null; materials: string | null; procedure: string | null;
    observations: string | null; interpretation: string | null; outcome: string | null; nextSteps: string | null;
    version: number; updatedAt: Date;
  }[]>`select * from public.experiments where entry_id = ${id}`;
  if (!experiment) return null;
  const [project] = entry.projectId
    ? await tx<{ id: string; title: string }[]>`select id, title from public.projects where id = ${entry.projectId}`
    : [null];
  const revisions = await tx<{ id: string; revisionNo: number; capturedAt: Date; procedure: string | null; observations: string | null; objective: string | null; materials: string | null; interpretation: string | null; outcome: string | null; nextSteps: string | null; status: string | null }[]>`
    select * from public.experiment_revisions where entry_id = ${id} order by revision_no desc`;
  const blockers = await tx<{ id: string; category: string; description: string; openedOn: string; resolvedOn: string | null }[]>`
    select id, category, description, opened_on, resolved_on from public.blockers where entry_id = ${id} order by (resolved_on is not null), opened_on desc`;
  const evidence = await evidenceFor(tx, "entry", id);
  return { entry, experiment, project, revisions, blockers, evidence };
}
