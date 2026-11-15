"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ConflictError } from "@/server/db";
import { run, ValidationError, oneOf, required, text, uuidOrNull, dateOrNull, versionOf, expectRow } from "@/server/actions/run";
import { readPartialDate } from "@/lib/dates";
import { cleanTitle, insertFeedback, insertPhaseEvent, insertTrial } from "@/server/writes";
import { DEFAULT_REVIEW_STEPS } from "@/lib/labels";
const EXPERIMENT_STATUSES = ["planned", "in_progress", "completed", "inconclusive", "unsuccessful", "paused"] as const;

// ---------------------------------------------------------------- manuscripts

/** A new publication: a review (it gets review steps) or an original article. */
export async function createManuscript(form: FormData) {
  const r = await run(async (tx) => {
    const title = required(form.get("title"), "Publication title");
    const [m] = await tx<{ id: string }[]>`
      insert into public.manuscripts (title, article_type)
      values (${title}, ${oneOf(form.get("articleType"), ["review", "original"] as const, "original")})
      returning id`;
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

/**
 * The journal's latest decision. An empty date keeps the decision date already recorded
 * (only "Clear the decision date" removes it), and every change is kept in the
 * submission's history by the database.
 */
export async function recordDecision(submissionId: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    const status = oneOf(form.get("status"), ["submitted", "under_review", "revise", "rejected", "accepted", "withdrawn"] as const);
    if (!status) throw new ValidationError("Choose the journal's decision.");
    const closes = ["rejected", "accepted", "withdrawn"].includes(status);
    const raw = String(form.get("decisionDate") ?? "").trim();
    const decisionDate = dateOrNull(raw);
    if (raw && !decisionDate) throw new ValidationError("That decision date isn't valid.");
    const clear = form.get("clearDecisionDate") === "on";
    expectRow(await tx`
      update public.submissions set status = ${status},
        decision_date = ${clear ? null : tx`coalesce(${decisionDate}::date, decision_date)`},
        closed_at = ${closes ? tx`coalesce(closed_at, now())` : null},
        notes = coalesce(${text(form.get("notes"), 2000)}, notes),
        version = version + 1
      where id = ${submissionId} and version = ${version}
      returning id`);
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

// Resolving / reopening feedback also moves its entry's version on, so an Entry page open
// elsewhere can't then save over it without noticing.
export async function resolveFeedback(entryId: string, form: FormData) {
  return run(async (tx) => {
    expectRow(await tx`update public.feedback set resolution_status = 'resolved', resolved_at = now(),
             resolution_note = ${text(form.get("note"), 2000)}, version = version + 1 where entry_id = ${entryId} returning entry_id`);
    await tx`update public.entries set version = version + 1 where id = ${entryId}`;
    refresh();
  });
}

export async function reopenFeedback(entryId: string) {
  return run(async (tx) => {
    expectRow(await tx`update public.feedback set resolution_status = 'open', resolved_at = null, version = version + 1
                       where entry_id = ${entryId} returning entry_id`);
    await tx`update public.entries set version = version + 1 where id = ${entryId}`;
    refresh();
  });
}

// ---------------------------------------------------------------- experiments

export async function createExperiment(form: FormData) {
  const r = await run(async (tx) => {
    const title = required(form.get("title"), "Experiment title");
    const [e] = await tx<{ id: string }[]>`
      insert into public.entries (title, kind, category, entry_precision)
      values (${title}, 'experiment', 'experiment', 'none') returning id`;
    await tx`insert into public.experiments (entry_id) values (${e.id})`;
    return e.id;
  });
  if (r.ok) redirect(`/research/experiments/${r.data}`);
  return r;
}

const EXP_FIELDS = ["objective", "materials", "procedure", "observations", "interpretation", "outcome", "nextSteps"] as const;

/**
 * Autosave for experiments, including the status chips (so a status change never leaves the
 * page holding an old version). A new edit session that changes the record makes the
 * database keep the previous values as a read-only earlier version.
 */
export async function updateExperiment(
  entryId: string,
  expectedVersion: number,
  sessionId: string,
  fields: Partial<Record<(typeof EXP_FIELDS)[number], string>> & { status?: string | null },
) {
  return run(async (tx) => {
    const values: Record<string, string | null> = {};
    for (const k of EXP_FIELDS) {
      if (k in fields) {
        const v = String(fields[k] ?? "").trim();
        if (v.length > 50000) throw new ValidationError("That section is too long.");
        values[k] = v || null;
      }
    }
    if ("status" in fields) values.status = oneOf(fields.status, EXPERIMENT_STATUSES);
    const session = uuidOrNull(sessionId);
    const [row] = Object.keys(values).length
      ? await tx<{ version: number }[]>`
          update public.experiments set ${tx(values)}, last_edit_session = ${session}, version = version + 1
          where entry_id = ${entryId} and version = ${expectedVersion}
          returning version`
      : await tx<{ version: number }[]>`
          update public.experiments set version = version + 1
          where entry_id = ${entryId} and version = ${expectedVersion}
          returning version`;
    if (!row) throw new ConflictError();
    return { version: row.version };
  });
}

/** Rename an experiment. */
export async function updateExperimentDetails(entryId: string, expectedVersion: number, details: { title: string }) {
  return run(async (tx) => {
    const title = cleanTitle(details.title);
    const [row] = await tx<{ version: number }[]>`
      update public.entries set title = ${title}, version = version + 1
      where id = ${entryId} and kind = 'experiment' and version = ${expectedVersion} and deleted_at is null
      returning version`;
    if (!row) throw new ConflictError();
    refresh();
    return { version: row.version };
  });
}

async function leaveExperiment(entryId: string, how: "archive" | "trash") {
  const r = await run(async (tx) => {
    const [e] = await tx<{ id: string }[]>`
      update public.entries
      set ${how === "archive" ? tx`archived_at = now()` : tx`deleted_at = now()`}, version = version + 1
      where id = ${entryId} and kind = 'experiment' and deleted_at is null
      returning id`;
    if (!e) throw new ValidationError("That experiment wasn't found — it may already be in Trash.");
    return e.id;
  });
  if (r.ok) redirect("/research?view=benchwork");
  return r;
}

/** Hidden from Benchwork and the Journal, kept (Settings → Archive restores it). */
export async function archiveExperiment(entryId: string) {
  return leaveExperiment(entryId, "archive");
}

/** Soft delete, like entries: restorable from Settings → Trash for 30 days. */
export async function trashExperiment(entryId: string) {
  return leaveExperiment(entryId, "trash");
}

export async function addBlocker(entryId: string, form: FormData) {
  return run(async (tx) => {
    const description = required(form.get("description"), "What's blocking", 1000);
    await tx`insert into public.blockers (entry_id, category, description, opened_on)
             values (${entryId},
                     ${oneOf(form.get("category"), ["equipment", "procurement", "protocol", "sample_preparation", "inconsistency", "other"] as const, "other")},
                     ${description}, app.user_today())`;
    refresh();
  });
}

export async function resolveBlocker(id: string) {
  return run(async (tx) => {
    // "today" on her own clock, not the database's (UTC)
    expectRow(await tx`update public.blockers set resolved_on = app.user_today() where id = ${id} and resolved_on is null returning id`);
    refresh();
  });
}

// ---------------------------------------------------------------- review milestones

const STEP_STATUSES = ["not_started", "in_progress", "done", "skipped"] as const;
const COUNT_KINDS = ["identified", "duplicates_removed", "screened", "excluded_screening", "full_text_retrieved", "excluded_eligibility", "included"] as const;

/** Start tracking a review with the standard steps (only when it has none yet). */
export async function setUpReviewSteps(manuscriptId: string) {
  return run(async (tx) => {
    // lock the publication, so two "Set up" clicks at once can't both add the steps
    const [m] = await tx`select 1 from public.manuscripts where id = ${uuidOrNull(manuscriptId)} and deleted_at is null for update`;
    if (!m) throw new ValidationError("That publication wasn't found.");
    const [has] = await tx`select 1 from public.review_steps where manuscript_id = ${manuscriptId} and removed_at is null limit 1`;
    if (has) return;
    const rows = DEFAULT_REVIEW_STEPS.map((s, i) => ({ manuscript_id: manuscriptId, sort: i + 1, title: s.title, count_kind: s.count }));
    await tx`insert into public.review_steps ${tx(rows, "manuscript_id", "sort", "title", "count_kind")}`;
    refresh();
  });
}

export async function updateReviewStep(id: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    const status = oneOf(form.get("status"), STEP_STATUSES, "not_started")!;
    // "1,234" and "1 234" are fine; anything but digits isn't
    const rawCount = String(form.get("count") ?? "").replace(/[\s,]/g, "");
    if (rawCount !== "" && !/^\d{1,8}$/.test(rawCount)) throw new ValidationError("The number must be a whole number, like 412.");
    const count = rawCount === "" ? null : Number(rawCount);
    const title = text(form.get("title"), 200);
    expectRow(await tx`
      update public.review_steps set
        ${title ? tx`title = ${title},` : tx``}
        status = ${status},
        done_on = ${status === "done" ? (dateOrNull(form.get("doneOn")) ?? tx`app.user_today()`) : null},
        count_kind = ${form.has("countKind") ? oneOf(form.get("countKind"), COUNT_KINDS) : tx`count_kind`},
        count = ${count},
        note = ${text(form.get("note"), 5000)},
        version = version + 1
      where id = ${uuidOrNull(id)} and version = ${version} and removed_at is null and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.deleted_at is null)
      returning id`);
    refresh();
  });
}

/** One click: done (today) ↔ not started. */
export async function toggleReviewStep(id: string, done: boolean) {
  return run(async (tx) => {
    const [row] = await tx`
      update public.review_steps
      set status = ${done ? "done" : "not_started"}, done_on = ${done ? tx`app.user_today()` : null}, version = version + 1
      where id = ${uuidOrNull(id)} and removed_at is null and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.deleted_at is null) returning id`;
    if (!row) throw new ValidationError("That step wasn't found.");
    refresh();
  });
}

export async function addReviewStep(manuscriptId: string, form: FormData) {
  return run(async (tx) => {
    const title = required(form.get("title"), "Step", 200);
    const [m] = await tx`select 1 from public.manuscripts where id = ${uuidOrNull(manuscriptId)} and deleted_at is null for update`;
    if (!m) throw new ValidationError("That publication wasn't found.");
    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(sort), 0) + 1 as next from public.review_steps where manuscript_id = ${manuscriptId}`;
    await tx`insert into public.review_steps (manuscript_id, sort, title) values (${manuscriptId}, ${next}, ${title})`;
    refresh();
  });
}

/** Removing a step hides it (kept in the export, like everything else). */
export async function removeReviewStep(id: string) {
  return run(async (tx) => {
    const [row] = await tx`update public.review_steps set removed_at = now(), version = version + 1 where id = ${uuidOrNull(id)} and removed_at is null and exists (select 1 from public.manuscripts m where m.id = manuscript_id and m.deleted_at is null) returning id`;
    if (!row) throw new ValidationError("That step wasn't found.");
    refresh();
  });
}

/** Review or original article (sets which progress the Publications view shows). */
export async function setArticleType(manuscriptId: string, type: string) {
  return run(async (tx) => {
    const t = oneOf(type, ["review", "original"] as const);
    if (!t) throw new ValidationError("Choose review or original article.");
    expectRow(await tx`update public.manuscripts set article_type = ${t}, version = version + 1 where id = ${uuidOrNull(manuscriptId)} and deleted_at is null returning id`);
    refresh();
  });
}

// ---------------------------------------------------------------- experiment trials

const OUTCOMES = ["worked", "did_not_work", "inconclusive"] as const;

/** A new trial, numbered after the last one; it starts with the previous trial's conditions to edit. */
export async function addTrial(entryId: string) {
  return run(async (tx) => {
    const { id } = await insertTrial(tx, { entryId });
    refresh();
    return id;
  });
}

export async function updateTrial(id: string, form: FormData) {
  return run(async (tx) => {
    const version = versionOf(form.get("version"));
    expectRow(await tx`
      update public.experiment_trials set
        run_on = ${form.has("runOn") ? dateOrNull(form.get("runOn")) : tx`run_on`},
        conditions = ${text(form.get("conditions"), 5000)},
        result = ${text(form.get("result"), 10000)},
        outcome = ${oneOf(form.get("outcome"), OUTCOMES)},
        version = version + 1
      where id = ${uuidOrNull(id)} and version = ${version} and removed_at is null and exists (select 1 from public.entries e where e.id = entry_id and e.deleted_at is null)
      returning id`);
    refresh();
  });
}

/** Hidden, not erased: it stays in the export, with its files. */
export async function removeTrial(id: string) {
  return run(async (tx) => {
    const [row] = await tx`update public.experiment_trials set removed_at = now(), version = version + 1 where id = ${uuidOrNull(id)} and removed_at is null and exists (select 1 from public.entries e where e.id = entry_id and e.deleted_at is null) returning id`;
    if (!row) throw new ValidationError("That trial wasn't found.");
    refresh();
  });
}
