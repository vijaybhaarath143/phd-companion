"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError } from "@/server/db";
import { run, ValidationError, oneOf, required, text, uuidOrNull } from "@/server/actions/run";
import { readPartialDate } from "@/lib/dates";
import { insertFeedback, insertPhaseEvent } from "@/server/writes";
const PROJECT_TYPES = ["systematic_review", "narrative_review", "experimental", "method_development",
  "instrument_development", "collaboration", "other"] as const;

// ---------------------------------------------------------------- projects

export async function createProject(form: FormData) {
  const r = await run(async (tx) => {
    const title = required(form.get("title"), "Project title");
    const [p] = await tx<{ id: string }[]>`
      insert into public.projects (title, type) values (${title}, ${oneOf(form.get("type"), PROJECT_TYPES)}) returning id`;
    return p.id;
  });
  if (r.ok) redirect(`/research/projects/${r.data}`);
  return r;
}

export async function updateProject(id: string, form: FormData) {
  return run(async (tx) => {
    const fields: Record<string, unknown> = {};
    if (form.has("status")) fields.status = oneOf(form.get("status"), ["proposed", "planning", "in_progress", "paused", "completed"] as const, "in_progress");
    if (form.has("objective")) fields.objective = text(form.get("objective"), 5000);
    if (form.has("title")) fields.title = required(form.get("title"), "Project title");
    if (form.has("type")) fields.type = oneOf(form.get("type"), PROJECT_TYPES);
    if (!Object.keys(fields).length) return;
    await tx`update public.projects set ${tx(fields)}, version = version + 1 where id = ${id}`;
    refresh();
  });
}

// ---------------------------------------------------------------- manuscripts

export async function createManuscript(projectId: string, form: FormData) {
  const r = await run(async (tx) => {
    const title = required(form.get("title"), "Manuscript title");
    const [m] = await tx<{ id: string }[]>`
      insert into public.manuscripts (project_id, title) values (${uuidOrNull(projectId)}, ${title}) returning id`;
    await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind, effective_precision) values (${m.id}, 'planning', 'change', 'none')`;
    return m.id;
  });
  if (r.ok) redirect(`/research/manuscripts/${r.data}`);
  return r;
}

/**
 * kind 'change' moves the current phase; 'earlier_change' only adds history,
 * so recording the past never resets where the manuscript is now.
 */
export async function recordPhase(manuscriptId: string, kind: "change" | "earlier_change", form: FormData) {
  return run(async (tx) => {
    await insertPhaseEvent(tx, manuscriptId, {
      kind,
      phase: String(form.get("phase") ?? ""),
      date: readPartialDate(form, "when"),
      note: text(form.get("note"), 1000),
      stoppedReason: String(form.get("stoppedReason") ?? ""),
    });
    refresh();
  });
}

export async function addSubmission(manuscriptId: string, form: FormData) {
  return run(async (tx) => {
    const journal = required(form.get("journal"), "Journal name", 300);
    const date = readPartialDate(form, "submitted");
    const status = oneOf(form.get("status"), ["planned", "submitted", "under_review"] as const, "submitted");
    const [open] = await tx`select 1 from public.submissions where manuscript_id = ${manuscriptId} and closed_at is null and status not in ('planned')`;
    if (open && status !== "planned") {
      throw new ValidationError("There's already an open submission. Record its decision first — then start a new attempt.");
    }
    await tx`
      insert into public.submissions (manuscript_id, attempt_no, journal_name, manuscript_ref, submitted_date, submitted_precision, status)
      values (${manuscriptId},
              coalesce((select max(attempt_no) from public.submissions where manuscript_id = ${manuscriptId}), 0) + 1,
              ${journal}, ${text(form.get("ref"), 200)}, ${date.date}, ${date.precision}, ${status})`;
    refresh();
  });
}

export async function recordDecision(submissionId: string, form: FormData) {
  return run(async (tx) => {
    const status = oneOf(form.get("status"), ["submitted", "under_review", "revise", "rejected", "accepted", "withdrawn"] as const);
    if (!status) throw new ValidationError("Choose the journal's decision.");
    const closes = ["rejected", "accepted", "withdrawn"].includes(status);
    const decisionDate = String(form.get("decisionDate") ?? "") || null;
    await tx`
      update public.submissions set status = ${status},
        decision_date = ${decisionDate && /^\d{4}-\d{2}-\d{2}$/.test(decisionDate) ? decisionDate : null},
        closed_at = ${closes ? tx`coalesce(closed_at, now())` : null},
        notes = coalesce(${text(form.get("notes"), 2000)}, notes),
        version = version + 1
      where id = ${submissionId}`;
    refresh();
  });
}

/** Guide feedback: one entry, its requested changes, and one linked task per change. */
export async function recordFeedback(manuscriptId: string, form: FormData) {
  return run(async (tx) => {
    await insertFeedback(tx, manuscriptId, {
      source: text(form.get("source"), 200),
      via: text(form.get("via"), 200),
      changes: text(form.get("changes"), 20000),
      date: readPartialDate(form, "received"),
      makeTasks: form.get("makeTasks") === "on",
    });
    refresh();
  });
}

export async function resolveFeedback(entryId: string, form: FormData) {
  return run(async (tx) => {
    await tx`update public.feedback set resolution_status = 'resolved', resolved_at = now(),
             resolution_note = ${text(form.get("note"), 2000)} where entry_id = ${entryId}`;
    refresh();
  });
}

export async function reopenFeedback(entryId: string) {
  return run(async (tx) => {
    await tx`update public.feedback set resolution_status = 'open', resolved_at = null where entry_id = ${entryId}`;
    refresh();
  });
}

// ---------------------------------------------------------------- experiments

export async function createExperiment(projectId: string | null, form: FormData) {
  const r = await run(async (tx) => {
    const title = required(form.get("title"), "Experiment title");
    const [e] = await tx<{ id: string }[]>`
      insert into public.entries (title, kind, category, entry_precision, project_id)
      values (${title}, 'experiment', 'experiment', 'none', ${uuidOrNull(projectId)}) returning id`;
    await tx`insert into public.experiments (entry_id) values (${e.id})`;
    return e.id;
  });
  if (r.ok) redirect(`/research/experiments/${r.data}`);
  return r;
}

const EXP_FIELDS = ["objective", "materials", "procedure", "observations", "interpretation", "outcome", "nextSteps"] as const;

/**
 * Autosave for experiments. A new edit session that changes the record makes the
 * database keep the previous values as a read-only earlier version.
 */
export async function updateExperiment(entryId: string, expectedVersion: number, sessionId: string, fields: Partial<Record<(typeof EXP_FIELDS)[number], string>>) {
  return run(async (tx) => {
    const values: Record<string, string | null> = {};
    for (const k of EXP_FIELDS) {
      if (k in fields) {
        const v = String(fields[k] ?? "").trim();
        if (v.length > 50000) throw new ValidationError("That section is too long.");
        values[k] = v || null;
      }
    }
    const session = uuidOrNull(sessionId);
    const [row] = await tx<{ version: number }[]>`
      update public.experiments set ${tx(values)}, last_edit_session = ${session}, version = version + 1
      where entry_id = ${entryId} and version = ${expectedVersion}
      returning version`;
    if (!row) throw new ConflictError();
    return { version: row.version };
  });
}

export async function setExperimentStatus(entryId: string, status: string) {
  return run(async (tx) => {
    const s = oneOf(status, ["planned", "in_progress", "completed", "inconclusive", "unsuccessful", "paused"] as const);
    await tx`update public.experiments set status = ${s}, version = version + 1 where entry_id = ${entryId}`;
    refresh();
  });
}

export async function addBlocker(entryId: string, form: FormData) {
  return run(async (tx) => {
    const description = required(form.get("description"), "What's blocking", 1000);
    const [e] = await tx<{ projectId: string | null }[]>`select project_id from public.entries where id = ${entryId}`;
    await tx`insert into public.blockers (entry_id, project_id, category, description)
             values (${entryId}, ${e?.projectId ?? null},
                     ${oneOf(form.get("category"), ["equipment", "procurement", "protocol", "sample_preparation", "inconsistency", "other"] as const, "other")},
                     ${description})`;
    refresh();
  });
}

export async function resolveBlocker(id: string) {
  return run(async (tx) => {
    await tx`update public.blockers set resolved_on = current_date where id = ${id}`;
    refresh();
  });
}
