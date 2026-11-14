import "server-only";
import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { withUser, type Tx } from "@/server/db";
import type { ConnectorUser } from "@/server/mcp/auth";
import { schemas, toPartialDate, decodeBase64, type ToolName, type ToolInput } from "@/server/mcp/schemas";
import { extractText, UnreadableFile } from "@/server/mcp/extract";
import { ValidationError } from "@/server/validate";
import { insertEntry, insertTask, setTaskStatus, insertLink, insertFeedback, insertPhaseEvent, parentExists, type ParentType } from "@/server/writes";
import { getHome } from "@/server/home";
import { getJournal, getEntry } from "@/server/journal";
import { listProjects, getProjectBundle, getManuscriptBundle, getExperimentBundle } from "@/server/research";
import { listTasks, listGoals } from "@/server/planner";
import { getAcademics } from "@/server/academics";
import { evidenceFor } from "@/server/evidence";
import { getProfile } from "@/server/profile";
import { formatPartialDate, todayIn, type Precision } from "@/lib/dates";
import { phases, type Phase } from "@/lib/labels";
import { MAX_FILE_BYTES, ALLOWED_DESCRIPTION, isAllowedName, safeFileName, sniff } from "@/lib/files";
import { friendlyDbError } from "@/lib/result";

export type ConnectorContext = {
  user: ConnectorUser;
  /** Her access token — used to reach her private file storage as her. */
  token: string;
  /** This site's address, for links back into the app. */
  origin: string;
};

const READ: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/** One MCP server per request (the endpoint is stateless), bound to the signed-in user. */
export function createConnectorServer(ctx: ConnectorContext) {
  const server = new McpServer(
    { name: "phd-companion", title: "PhD Companion", version: "1.0.0" },
    {
      instructions:
        "PhD Companion is one PhD scholar's private record of her doctorate: journal entries, projects, manuscripts, " +
        "experiments, tasks, goals, academics (credits, courses, milestones, office enquiries) and evidence files. " +
        "Dates can be partial: a day, only a month ('day not known'), or no date yet — never invent a day. " +
        "Start with get_home_summary or search. You can add and update records, but nothing is ever erased: " +
        "move_to_trash only moves a journal entry or task to the app's Trash, where she can restore it for 30 days. " +
        "Each result includes a link she can open in the app.",
    },
  );
  const link = (path: string) => `${ctx.origin}${path}`;
  const db = <T,>(fn: (tx: Tx) => Promise<T>) => withUser(ctx.user, fn);

  function tool<N extends ToolName>(
    name: N,
    title: string,
    description: string,
    annotations: ToolAnnotations,
    run: (args: ToolInput<N>) => Promise<unknown>,
  ) {
    server.registerTool(
      name,
      { title, description, inputSchema: schemas[name], annotations: { title, ...annotations } },
      // The SDK has already checked the input against the schema.
      (async (args: ToolInput<N>) => respond(() => run(args))) as never,
    );
  }

  // ---------------------------------------------------------------- reading

  tool("search", "Search everything", "Search all her records — journal entries (including experiments, feedback, enquiries), projects, manuscripts, journal submissions, tasks, courses, and files/links — for some words.", READ, async ({ query, limit }) =>
    db(async (tx) => {
      const j = await getJournal(tx, { q: query, limit: 50 });
      const like = `%${query}%`;
      const files = await tx<{ id: string; kind: string; parentType: string; parentId: string; label: string | null; filename: string | null; url: string | null }[]>`
        select id, kind, parent_type, parent_id, label, filename, url from public.attachments
        where removed_at is null and replaced_by_id is null and status = 'verified'
          and (label ilike ${like} or filename ilike ${like} or url ilike ${like})
        order by created_at desc limit 10`;
      return {
        journal_entries: [...j.dated, ...j.undated].slice(0, limit ?? 20).map((e) => entrySummary(e, link)),
        other_matches: j.otherMatches.map((m) => ({ kind: m.kind, title: m.title, link: link(m.href) })),
        files_and_links: files,
      };
    }),
  );

  tool("get_home_summary", "Get Home summary", "What needs her attention now (overdue tasks, open guide feedback, waiting tasks, follow-ups, blockers, undated entries), what's coming up, the projects she's working on, recent entries and her coursework credit total — the app's Home page.", READ, async () =>
    db(async (tx) => {
      const profile = await getProfile(tx);
      const today = todayIn(profile?.timezone ?? "Asia/Kolkata");
      const h = await getHome(tx, today);
      const withLink = <T extends { href: string }>({ href, ...rest }: T) => ({ ...rest, link: link(href) });
      return {
        today,
        needs_attention: h.attention.map(withLink),
        needs_attention_total: h.attentionTotal,
        coming_up: h.comingUp.map(withLink),
        working_on: h.workingOn.map(withLink),
        recent_entries: h.recent.map(withLink),
        credits: h.credits,
      };
    }),
  );

  tool("list_journal_entries", "List journal entries", "List journal entries, newest first, optionally filtered by words, category, project or months. Each has a partial date: day, month only ('day not known'), or no date yet (undated entries are listed separately).", READ, async (a) =>
    db(async (tx) => {
      const limit = a.limit ?? 50;
      const j = await getJournal(tx, { q: a.query, category: a.category, project: a.project_id, from: a.from_month, to: a.to_month, limit: Math.max(limit, 50) });
      return {
        entries: j.dated.slice(0, limit).map((e) => ({ ...entrySummary(e, link), only_partly_in_range: j.partial.has(e.id) || undefined })),
        more_older_entries: j.hasOlder || j.dated.length > limit,
        undated_entries: j.undated.map((e) => entrySummary(e, link)),
      };
    }),
  );

  tool("get_journal_entry", "Get a journal entry", "Everything recorded on one journal entry: its partial date, notes, people, outcome, event / feedback / office-enquiry details, tasks that came from it and its files and links.", READ, async ({ entry_id }) =>
    db(async (tx) => {
      const e = await getEntry(tx, entry_id);
      if (!e) throw new ValidationError("That journal entry wasn't found (it may be in Trash).");
      return { ...e, date_label: formatPartialDate(e.entryDate, e.entryPrecision), link: link(`/journal/${e.id}`), note: e.hasExperiment ? "This is an experiment — use get_experiment for its procedure, observations and earlier versions." : undefined };
    }),
  );

  tool("list_projects", "List projects", "Her current research projects (not archived), with status.", READ, async () =>
    db(async (tx) => (await listProjects(tx)).map((p) => ({ ...p, link: link(`/research/projects/${p.id}`) }))),
  );

  tool("get_project", "Get a project's details", "One project: objective, status, dates, its manuscripts (with phase), experiments, open tasks, recent journal entries, milestones and files/links.", READ, async ({ project_id }) =>
    db(async (tx) => {
      const b = await getProjectBundle(tx, project_id);
      if (!b) throw new ValidationError("That project wasn't found.");
      return {
        ...b,
        manuscripts: b.manuscripts.map((m) => ({ ...m, phase_label: phases[m.currentPhase], link: link(`/research/manuscripts/${m.id}`) })),
        experiments: b.experiments.map((x) => ({ ...x, date_label: formatPartialDate(x.entryDate, x.entryPrecision), link: link(`/research/experiments/${x.id}`) })),
        entries: b.entries.map((e) => ({ ...e, date_label: formatPartialDate(e.entryDate, e.entryPrecision), link: link(`/journal/${e.id}`) })),
        milestones: b.milestones.map((m) => ({ ...m, target_label: formatPartialDate(m.targetDate, m.targetPrecision) })),
        link: link(`/research/projects/${project_id}`),
      };
    }),
  );

  tool("list_manuscripts", "List manuscripts", "Her manuscripts with their current phase, project, open guide feedback and latest journal submission.", READ, async ({ project_id }) =>
    db(async (tx) => {
      const rows = await tx<{ id: string; title: string; currentPhase: Phase; projectId: string | null; projectTitle: string | null; openFeedback: number; latestJournal: string | null; latestStatus: string | null }[]>`
        select m.id, m.title, m.current_phase, m.project_id, p.title as project_title,
          (select count(*)::int from public.feedback f join public.entries e on e.id = f.entry_id
            where f.manuscript_id = m.id and f.resolution_status = 'open' and e.deleted_at is null) as open_feedback,
          s.journal_name as latest_journal, s.status as latest_status
        from public.manuscripts m
        left join public.projects p on p.id = m.project_id
        left join lateral (select journal_name, status from public.submissions where manuscript_id = m.id order by attempt_no desc limit 1) s on true
        where m.deleted_at is null and m.archived_at is null and (${project_id ?? null}::uuid is null or m.project_id = ${project_id ?? null})
        order by m.created_at`;
      return rows.map((m) => ({ ...m, phase_label: phases[m.currentPhase], link: link(`/research/manuscripts/${m.id}`) }));
    }),
  );

  tool("get_manuscript", "Get a manuscript", "One manuscript: current phase, full phase history (with partial dates), every journal submission and its decision, guide feedback (open and resolved) and tasks waiting on it.", READ, async ({ manuscript_id }) =>
    db(async (tx) => {
      const b = await getManuscriptBundle(tx, manuscript_id);
      if (!b) throw new ValidationError("That manuscript wasn't found.");
      return {
        ...b,
        manuscript: { ...b.manuscript, phase_label: phases[b.manuscript.currentPhase], link: link(`/research/manuscripts/${manuscript_id}`) },
        history: b.history.map((h) => ({ ...h, phase_label: phases[h.phase], date_label: formatPartialDate(h.effectiveDate, h.effectivePrecision) })),
        submissions: b.submissions.map((s) => ({ ...s, submitted_label: formatPartialDate(s.submittedDate, s.submittedPrecision) })),
        feedback: b.feedback.map((f) => ({ ...f, date_label: formatPartialDate(f.entryDate, f.entryPrecision), link: link(`/journal/${f.entryId}`) })),
      };
    }),
  );

  tool("list_experiments", "List experiments", "Her laboratory experiments with status, date and project.", READ, async ({ project_id }) =>
    db(async (tx) => {
      const rows = await tx<{ id: string; title: string; status: string | null; entryDate: string | null; entryPrecision: Precision; projectTitle: string | null; updatedAt: Date }[]>`
        select e.id, e.title, x.status, e.entry_date, e.entry_precision, p.title as project_title, x.updated_at
        from public.entries e join public.experiments x on x.entry_id = e.id
        left join public.projects p on p.id = e.project_id
        where e.deleted_at is null and e.archived_at is null and (${project_id ?? null}::uuid is null or e.project_id = ${project_id ?? null})
        order by e.date_from desc nulls last, e.created_at desc limit 200`;
      return rows.map((x) => ({ ...x, date_label: formatPartialDate(x.entryDate, x.entryPrecision), link: link(`/research/experiments/${x.id}`) }));
    }),
  );

  tool("get_experiment", "Get an experiment", "One experiment: objective, materials, procedure, observations, interpretation, outcome, next steps, blockers, files — and its earlier versions (kept automatically whenever it was edited in a new session).", READ, async ({ experiment_id }) =>
    db(async (tx) => {
      const b = await getExperimentBundle(tx, experiment_id);
      if (!b) throw new ValidationError("That experiment wasn't found.");
      return { ...b, earlier_versions: b.revisions, revisions: undefined, date_label: formatPartialDate(b.entry.entryDate, b.entry.entryPrecision), link: link(`/research/experiments/${experiment_id}`) };
    }),
  );

  tool("list_tasks", "List tasks", "Her tasks: open (to do, doing and waiting — the default), waiting only (with what each is waiting for), or done.", READ, async ({ show }) =>
    db(async (tx) => (await listTasks(tx, show ?? "open")).map((t) => ({ ...t, link: link(t.status === "waiting" ? "/planner?show=waiting" : "/planner") }))),
  );

  tool("list_goals", "List goals", "Her goals for the week, month, semester or year, and whether each was achieved.", READ, async () => db((tx) => listGoals(tx)));

  tool("get_academics", "Get academics", "Coursework credits (required, earned, recognised, and whether the total is incomplete), courses, PhD milestones (with partial dates) and office enquiries with follow-up dates.", READ, async () =>
    db(async (tx) => {
      const a = await getAcademics(tx);
      return {
        ...a,
        milestones: a.milestones.map((m) => ({ ...m, target_label: formatPartialDate(m.targetDate, m.targetPrecision), done_label: m.doneOn ? formatPartialDate(m.doneOn, m.donePrecision) : null })),
        enquiries: a.enquiries.map((q) => ({ ...q, link: link(`/journal/${q.entryId}`) })),
        link: link("/academics"),
      };
    }),
  );

  tool("list_files_and_links", "List a record's files and links", "The evidence files and links attached to a journal entry, project, manuscript, course or milestone. Use read_file_text to read a file.", READ, async ({ record_type, record_id }) =>
    db(async (tx) => {
      if (!(await parentExists(tx, record_type, record_id))) throw new ValidationError("That record wasn't found.");
      return evidenceFor(tx, record_type, record_id);
    }),
  );

  tool("read_file_text", "Read a file's text", `Read the text inside one of her evidence files: PDF text, Word documents, Excel/CSV rows, PowerPoint slide text or text files (images have no text). Returns up to 40,000 characters at a time; use next_start to read on.`, READ, async ({ file_id, start }) => {
    const [file] = await db((tx) =>
      tx<{ storagePath: string; filename: string; label: string | null; sizeBytes: number }[]>`
        select storage_path, filename, label, size_bytes::int as size_bytes from public.attachments
        where id = ${file_id} and kind = 'file' and status = 'verified' and removed_at is null`,
    );
    if (!file) throw new ValidationError("That file wasn't found.");
    const { data, error } = await storage(ctx.token).download(file.storagePath);
    if (error || !data) throw new ValidationError("The file couldn't be opened just now. Try again.");
    const out = await extractText(new Uint8Array(await data.arrayBuffer()), file.filename, start ?? 0);
    return { file: file.label ?? file.filename, ...out, next_start: out.nextStart, nextStart: undefined, link: link(`/api/files/${file_id}`) };
  });

  // ---------------------------------------------------------------- adding and changing

  tool("create_journal_entry", "Add a journal entry", "Add an entry to her research journal. The date can be a day (YYYY-MM-DD), just a month (YYYY-MM) or left out — never guess a day she didn't give. A laboratory-experiment category also creates an experiment record.", WRITE, async (a) =>
    db(async (tx) => {
      const profile = await getProfile(tx);
      const r = await insertEntry(
        tx,
        { id: crypto.randomUUID(), title: a.title, date: toPartialDate(a.date), category: a.category ?? null, projectId: a.project_id ?? null, notes: a.notes ?? null, people: a.people ?? null, planned: a.planned ?? false },
        todayIn(profile?.timezone ?? "Asia/Kolkata"),
      );
      const d = toPartialDate(a.date);
      return { added: true, id: r.id, kind: r.kind, status: r.status, date_label: formatPartialDate(d.date, d.precision), link: link(r.kind === "experiment" ? `/research/experiments/${r.id}` : `/journal/${r.id}`) };
    }),
  );

  tool("create_task", "Add a task", "Add a task to her planner, optionally with a due date and linked to a project, manuscript or the journal entry it came from.", WRITE, async (a) =>
    db(async (tx) => {
      const r = await insertTask(tx, { id: crypto.randomUUID(), title: a.title, dueDate: a.due_date ?? null, priority: a.priority ?? "normal", projectId: a.project_id ?? null, notes: a.notes ?? null, originEntryId: a.from_entry_id ?? null, manuscriptId: a.manuscript_id ?? null });
      return { added: true, id: r.id, link: link("/planner") };
    }),
  );

  tool("update_task_status", "Update a task's status", "Mark a task to do, doing, waiting (say what it's waiting for), done or cancelled.", WRITE, async (a) => {
    if (a.status === "waiting" && !a.waiting_reason && !a.waiting_on_task_id) {
      throw new ValidationError("Say what the task is waiting for (waiting_reason).");
    }
    return db(async (tx) => {
      const t = await setTaskStatus(tx, a.task_id, a.status, { waitingReason: a.waiting_reason, waitingOnTaskId: a.waiting_on_task_id });
      return { updated: true, ...t, link: link("/planner") };
    });
  });

  tool("add_link", "Add a link", "Attach a web link (a paper, dataset, shared document, etc.) as evidence on a journal entry, project, manuscript, course or milestone.", WRITE, async (a) =>
    db(async (tx) => {
      const r = await insertLink(tx, a.record_type, a.record_id, a.url, a.label ?? null);
      return { added: true, id: r.id };
    }),
  );

  tool("add_guide_feedback", "Add guide feedback", "Record feedback on a manuscript from her guide (or someone else): what they asked to change, how and when it came. Can also create one task per requested change.", WRITE, async (a) =>
    db(async (tx) => {
      const r = await insertFeedback(tx, a.manuscript_id, {
        source: a.from ?? null,
        via: a.received_via ?? null,
        changes: a.requested_changes,
        date: toPartialDate(a.received_date),
        makeTasks: a.make_tasks ?? false,
      });
      return { added: true, feedback_entry_id: r.entryId, tasks_created: r.taskIds.length, link: link(`/research/manuscripts/${a.manuscript_id}`) };
    }),
  );

  tool("move_manuscript_to_phase", "Move a manuscript to a phase", "Record that a manuscript moved to a new phase (e.g. writing → review → submitted). The full history is kept. Set history_only to add an earlier change to the history without moving the current phase.", WRITE, async (a) =>
    db(async (tx) => {
      const r = await insertPhaseEvent(tx, a.manuscript_id, {
        kind: a.history_only ? "earlier_change" : "change",
        phase: a.phase,
        date: toPartialDate(a.date),
        note: a.note ?? null,
        stoppedReason: a.stopped_reason ?? null,
      });
      return { recorded: true, phase: r.phase, phase_label: phases[r.phase], moved_current_phase: !a.history_only, link: link(`/research/manuscripts/${a.manuscript_id}`) };
    }),
  );

  tool("add_file", "Add a file", `Attach a file as evidence on a record, from base64 content. Allowed: ${ALLOWED_DESCRIPTION}. The file is checked to really be the type its name says. Keep files sent this way under about 3 MB (the request size limit); for bigger files, ask her to upload in the app or add a link.`, WRITE, async (a) => {
    if (!isAllowedName(a.filename)) throw new ValidationError(`That type of file isn't supported. You can add ${ALLOWED_DESCRIPTION}.`);
    const bytes = decodeBase64(a.content_base64);
    if (!bytes) throw new ValidationError("content_base64 isn't valid base64.");
    if (bytes.length === 0) throw new ValidationError("That file is empty.");
    if (bytes.length > MAX_FILE_BYTES) throw new ValidationError("That file is larger than 20 MB. Add a link to it instead.");
    const mime = sniff(bytes, a.filename);
    if (!mime) throw new ValidationError("That file doesn't look like the type its name says. It wasn't added.");
    return db(async (tx) => {
      if (!(await parentExists(tx, a.record_type as ParentType, a.record_id))) throw new ValidationError("That record wasn't found.");
      const id = crypto.randomUUID();
      const filename = safeFileName(a.filename);
      const path = `${ctx.user.id}/${id}/${filename}`;
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await tx`
        insert into public.attachments (id, parent_type, parent_id, kind, storage_path, filename, label, mime_type, size_bytes, sha256, status)
        values (${id}, ${a.record_type}, ${a.record_id}, 'file', ${path}, ${filename}, ${(a.label || a.filename).slice(0, 200)},
                ${mime}, ${bytes.length}, ${sha256}, 'verified')`;
      // Stored in her private folder as her; if this fails the record above is rolled back.
      const { error } = await storage(ctx.token).upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw new Error(`upload failed: ${error.message}`);
      return { added: true, id, filename, size_bytes: bytes.length };
    });
  });

  tool("move_to_trash", "Move to Trash", "Move a journal entry or a task to the app's Trash. Nothing is erased: she can restore it from Trash for 30 days.", { ...WRITE, destructiveHint: true, idempotentHint: true }, async ({ record_type, record_id }) =>
    db(async (tx) => {
      const [row] = record_type === "entry"
        ? await tx<{ title: string }[]>`update public.entries set deleted_at = now(), version = version + 1 where id = ${record_id} and deleted_at is null returning title`
        : await tx<{ title: string }[]>`update public.tasks set deleted_at = now(), version = version + 1 where id = ${record_id} and deleted_at is null returning title`;
      if (!row) throw new ValidationError("That wasn't found (or is already in Trash).");
      return { moved_to_trash: true, title: row.title, restore_from: link("/settings") };
    }),
  );

  return server;
}

function entrySummary(
  e: { id: string; title: string; kind: string; category: string | null; status: string | null; entryDate: string | null; entryPrecision: Precision; projectTitle: string | null; experimentStatus: string | null },
  link: (p: string) => string,
) {
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    status: e.status,
    date: e.entryDate,
    date_precision: e.entryPrecision,
    date_label: formatPartialDate(e.entryDate, e.entryPrecision),
    project: e.projectTitle,
    experiment_status: e.experimentStatus ?? undefined,
    link: link(e.kind === "experiment" ? `/research/experiments/${e.id}` : `/journal/${e.id}`),
  };
}

/** Her private file storage, reached as her (storage's own row-level security applies). */
function storage(token: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from("evidence");
}

/** Turn a tool's result (or a problem) into what the assistant reads. */
export async function respond(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 1) }] };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof UnreadableFile) return problem(e.message);
    if (e instanceof z.ZodError) return problem(e.issues.map((i) => i.message).join(" "));
    const r = friendlyDbError(e);
    return problem(r.ok ? "Something went wrong." : r.error.message);
  }
}

function problem(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}
