import "server-only";
import type { Tx } from "@/server/db";
import type { Precision } from "@/lib/dates";
import type { Phase, PrismaCount, ReviewStepStatus } from "@/lib/labels";
import { evidenceFor, type EvidenceItem } from "@/server/evidence";
import { isUuid } from "@/lib/utils";

export async function getManuscriptBundle(tx: Tx, id: string) {
  if (!isUuid(id)) return null;
  const [manuscript] = await tx<{
    id: string; title: string; currentPhase: Phase; stoppedReason: string | null;
    doi: string | null; authors: string | null; articleType: string | null; version: number;
  }[]>`select * from public.manuscripts where id = ${id} and deleted_at is null`;
  if (!manuscript) return null;
  const history = await tx<{ id: string; phase: Phase; effectiveDate: string | null; effectivePrecision: Precision; recordedAt: Date; kind: string; note: string | null; createdVia: string }[]>`
    select id, phase, effective_date, effective_precision, recorded_at, kind, note, created_via
    from public.manuscript_phase_events where manuscript_id = ${id}
    order by coalesce(effective_date, recorded_at::date) desc, recorded_at desc`;
  const submissions = await tx<{
    id: string; attemptNo: number; journalName: string; manuscriptRef: string | null; submittedDate: string | null;
    submittedPrecision: Precision; status: string; decisionDate: string | null; closedAt: Date | null; notes: string | null; version: number;
  }[]>`select * from public.submissions where manuscript_id = ${id} order by attempt_no desc`;
  // Every status / decision-date change of each submission, oldest first (kept by the database).
  const submissionHistory = await tx<{ id: string; submissionId: string; status: string; decisionDate: string | null; recordedAt: Date; createdVia: string }[]>`
    select se.id, se.submission_id, se.status, se.decision_date, se.recorded_at, se.created_via
    from public.submission_events se join public.submissions s on s.id = se.submission_id
    where s.manuscript_id = ${id}
    order by se.recorded_at, se.id`;
  const feedback = await tx<{ entryId: string; title: string; source: string | null; requestedChanges: string | null; resolutionStatus: string; entryDate: string | null; entryPrecision: Precision; taskCount: number }[]>`
    select f.entry_id, e.title, f.source, f.requested_changes, f.resolution_status, e.entry_date, e.entry_precision,
      (select count(*)::int from public.tasks t where t.origin_entry_id = e.id and t.deleted_at is null) as task_count
    from public.feedback f join public.entries e on e.id = f.entry_id
    where f.manuscript_id = ${id} and e.deleted_at is null
    order by (f.resolution_status = 'resolved'), e.created_at desc`;
  const waitingTasks = await tx<{ id: string; title: string; waitingReason: string | null }[]>`
    select id, title, waiting_reason from public.tasks where manuscript_id = ${id} and status = 'waiting' and deleted_at is null`;
  const tasks = await tx<{ id: string; title: string; status: string; dueDate: string | null; waitingReason: string | null }[]>`
    select id, title, status, due_date, waiting_reason from public.tasks
    where manuscript_id = ${id} and deleted_at is null and status not in ('done', 'cancelled')
    order by (status = 'waiting'), due_date nulls last, created_at`;
  const entries = await tx<{ id: string; title: string; entryDate: string | null; entryPrecision: Precision; category: string | null }[]>`
    select id, title, entry_date, entry_precision, category from public.entries
    where manuscript_id = ${id} and deleted_at is null and archived_at is null and kind <> 'feedback'
    order by date_from desc nulls last, created_at desc limit 8`;
  const steps = await getReviewSteps(tx, id);
  const evidence = await evidenceFor(tx, "manuscript", id);
  return { manuscript, history, submissions, submissionHistory, feedback, waitingTasks, tasks, entries, steps, evidence };
}

export async function getExperimentBundle(tx: Tx, id: string) {
  if (!isUuid(id)) return null;
  const [entry] = await tx<{ id: string; title: string; entryDate: string | null; entryPrecision: Precision; version: number; archivedAt: Date | null }[]>`
    select id, title, entry_date, entry_precision, version, archived_at from public.entries where id = ${id} and deleted_at is null`;
  if (!entry) return null;
  const [experiment] = await tx<{
    status: string | null; objective: string | null; materials: string | null; procedure: string | null;
    observations: string | null; interpretation: string | null; outcome: string | null; nextSteps: string | null;
    version: number; updatedAt: Date;
  }[]>`select * from public.experiments where entry_id = ${id}`;
  if (!experiment) return null;
  const revisions = await tx<{ id: string; revisionNo: number; capturedAt: Date; procedure: string | null; observations: string | null; objective: string | null; materials: string | null; interpretation: string | null; outcome: string | null; nextSteps: string | null; status: string | null }[]>`
    select * from public.experiment_revisions where entry_id = ${id} order by revision_no desc`;
  const blockers = await tx<{ id: string; category: string; description: string; openedOn: string; resolvedOn: string | null }[]>`
    select id, category, description, opened_on, resolved_on from public.blockers where entry_id = ${id} order by (resolved_on is not null), opened_on desc`;
  const evidence = await evidenceFor(tx, "entry", id);
  return { entry, experiment, revisions, blockers, evidence };
}

// ---------------------------------------------------------------- review milestones

export type ReviewStep = {
  id: string;
  sort: number;
  title: string;
  status: ReviewStepStatus;
  doneOn: string | null;
  countKind: PrismaCount | null;
  count: number | null;
  note: string | null;
  version: number;
};

export async function getReviewSteps(tx: Tx, manuscriptId: string) {
  return tx<ReviewStep[]>`
    select id, sort, title, status, done_on, count_kind, count, note, version from public.review_steps
    where manuscript_id = ${manuscriptId} and removed_at is null order by sort, created_at`;
}

/**
 * The PRISMA numbers from the steps' counts. "Records screened" is worked out (identified
 * minus duplicates) unless a step records it directly; anything unknown stays null.
 */
export function prismaNumbers(steps: Pick<ReviewStep, "countKind" | "count" | "status">[]) {
  // several steps can record the same number (e.g. one search per database): they add up
  const got = (k: PrismaCount) => {
    const counted = steps.filter((s) => s.countKind === k && s.count !== null && s.status !== "skipped");
    return counted.length ? counted.reduce((sum, s) => sum + (s.count ?? 0), 0) : null;
  };
  // a skipped "remove duplicates" step means none were removed
  const skippedOnly = (k: PrismaCount) => steps.some((s) => s.countKind === k) && steps.filter((s) => s.countKind === k).every((s) => s.status === "skipped");
  const identified = got("identified");
  const duplicates = got("duplicates_removed") ?? (skippedOnly("duplicates_removed") ? 0 : null);
  const screened = got("screened") ?? (identified !== null && duplicates !== null ? Math.max(identified - duplicates, 0) : null);
  return {
    identified,
    duplicates_removed: duplicates,
    screened,
    excluded_screening: got("excluded_screening"),
    full_text_retrieved: got("full_text_retrieved"),
    excluded_eligibility: got("excluded_eligibility"),
    included: got("included"),
  } satisfies Record<PrismaCount, number | null>;
}

// ---------------------------------------------------------------- publications and benchwork

export type PublicationRow = {
  key: string;
  manuscriptId: string;
  title: string;
  articleType: "review" | "original";
  currentPhase: Phase | null;
  openFeedback: number;
  waiting: number;
};

/** Every publication (manuscript), reviews first. */
export async function listPublications(tx: Tx): Promise<PublicationRow[]> {
  return tx<PublicationRow[]>`
    select 'm:' || m.id as key, m.id as manuscript_id, m.title,
      case when m.article_type = 'review' then 'review' else 'original' end as article_type,
      m.current_phase,
      (select count(*)::int from public.feedback f join public.entries e on e.id = f.entry_id
        where f.manuscript_id = m.id and f.resolution_status = 'open' and e.deleted_at is null) as open_feedback,
      (select count(*)::int from public.tasks t where t.manuscript_id = m.id and t.status = 'waiting' and t.deleted_at is null) as waiting
    from public.manuscripts m
    where m.deleted_at is null and m.archived_at is null
    order by 4 desc, m.created_at`;
}

export async function listBenchwork(tx: Tx) {
  return tx<{ id: string; title: string; status: string | null; entryDate: string | null; entryPrecision: Precision; trials: number; lastTrial: string | null; openBlockers: number }[]>`
    select e.id, e.title, x.status, e.entry_date, e.entry_precision,
      (select count(*)::int from public.experiment_trials t where t.entry_id = e.id and t.removed_at is null) as trials,
      (select max(run_on) from public.experiment_trials t where t.entry_id = e.id and t.removed_at is null) as last_trial,
      (select count(*)::int from public.blockers b where b.entry_id = e.id and b.resolved_on is null) as open_blockers
    from public.entries e join public.experiments x on x.entry_id = e.id
    where e.deleted_at is null and e.archived_at is null
    order by e.date_from desc nulls last, e.created_at desc`;
}

// ---------------------------------------------------------------- experiment trials

export type Trial = {
  id: string;
  trialNo: number;
  runOn: string | null;
  conditions: string | null;
  result: string | null;
  outcome: "worked" | "did_not_work" | "inconclusive" | null;
  version: number;
  evidence: EvidenceItem[];
};

/** An experiment's trials, newest first, each with its own files and links. */
export async function getTrials(tx: Tx, entryId: string): Promise<Trial[]> {
  const rows = await tx<Omit<Trial, "evidence">[]>`
    select id, trial_no, run_on, conditions, result, outcome, version from public.experiment_trials
    where entry_id = ${entryId} and removed_at is null order by trial_no desc`;
  if (!rows.length) return [];
  // every trial's files and links in one query
  const files = await tx<(EvidenceItem & { parentId: string })[]>`
    select id, kind, url, label, filename, size_bytes::int as size_bytes, mime_type, created_via, parent_id
    from public.attachments
    where parent_type = 'trial' and parent_id = any(${rows.map((t) => t.id)}::uuid[])
      and removed_at is null and replaced_by_id is null and status = 'verified'
    order by created_at`;
  return rows.map((t) => ({ ...t, evidence: files.filter((f) => f.parentId === t.id).map(({ parentId: _p, ...f }) => f) }));
}
