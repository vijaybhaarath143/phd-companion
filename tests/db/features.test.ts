import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/db";
import { admin, dropUser, makeUser, withUser } from "./helpers";

/**
 * The app's own write actions, run as a real account against the local database.
 * (Sign-in and page refreshes are stood in for: actions run as `u`, refresh() does nothing.)
 */
let u: SessionUser;

vi.mock("@/server/auth", () => ({
  asUser: <T,>(fn: (tx: import("@/server/db").Tx, user: SessionUser) => Promise<T>) => withUser(u, (tx) => fn(tx, u)),
  requireUser: async () => u,
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

const { updateEntry, setEntryDate } = await import("@/server/actions/entries");
const { recordDecision, updateExperiment, resolveFeedback } = await import("@/server/actions/research");
const { updateTask } = await import("@/server/actions/tasks");
const { updateEnquiry, updateMilestone } = await import("@/server/actions/academics");
const { addGoal, trashGoal, restoreFromTrash } = await import("@/server/actions/settings");
const { getJournal } = await import("@/server/journal");
const { getHome, getReminders } = await import("@/server/home");
const { listGoals } = await import("@/server/planner");

function form(fields: Record<string, string | number>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, String(v));
  return f;
}

beforeAll(async () => {
  u = await makeUser("features");
});

afterAll(async () => {
  await dropUser(u);
  await admin.end();
});

describe("journal entries", () => {
  it("a new category brings the matching kind and its event details", async () => {
    const [e] = await withUser(u, (tx) => tx`insert into public.entries (title, entry_precision) values ('Talk', 'none') returning id, version`);
    const r = await updateEntry(e.id, e.version, { entry: { category: "conference" } });
    expect(r.ok && r.data.kind).toBe("event");
    const [ev] = await withUser(u, (tx) => tx`select participation from public.events where entry_id = ${e.id}`);
    expect(ev.participation).toBe("unknown");
  });

  it("feedback entries keep their kind when the category changes", async () => {
    const [e] = await withUser(u, (tx) => tx`insert into public.entries (title, kind, entry_precision) values ('Comments', 'feedback', 'none') returning id, version`);
    const r = await updateEntry(e.id, e.version, { entry: { category: "conference" } });
    expect(r.ok && r.data.kind).toBe("feedback");
  });

  it("a stale version is refused, and editing an enquiry elsewhere makes the Entry page's version stale", async () => {
    const [e] = await withUser(u, async (tx) => {
      const rows = await tx`insert into public.entries (title, kind, entry_precision) values ('Fee query', 'enquiry', 'none') returning id, version`;
      await tx`insert into public.enquiries (entry_id) values (${rows[0].id})`;
      return rows;
    });
    expect((await updateEnquiry(e.id, form({ version: e.version, response: "Pay at counter 3", status: "waiting" }))).ok).toBe(true);
    const stale = await updateEntry(e.id, e.version, { enquiry: { response: "overwrite" } });
    expect(!stale.ok && stale.error.kind).toBe("conflict");
    const [q] = await withUser(u, (tx) => tx`select response from public.enquiries where entry_id = ${e.id}`);
    expect(q.response).toBe("Pay at counter 3");
    expect((await setEntryDate(e.id, e.version, { date: "2026-11-14", precision: "day" })).ok).toBe(false);
  });

  it("resolving feedback moves its entry's version on", async () => {
    const [e] = await withUser(u, async (tx) => {
      const rows = await tx`insert into public.entries (title, kind, entry_precision) values ('Review', 'feedback', 'none') returning id, version`;
      await tx`insert into public.feedback (entry_id) values (${rows[0].id})`;
      return rows;
    });
    expect((await resolveFeedback(e.id, form({ note: "done" }))).ok).toBe(true);
    const [after] = await withUser(u, (tx) => tx`select version from public.entries where id = ${e.id}`);
    expect(after.version).toBe(e.version + 1);
  });

  it("search treats % and _ as plain characters, and bad filters are ignored instead of failing", async () => {
    await withUser(u, async (tx) => {
      await tx`insert into public.entries (title, entry_date, entry_precision) values ('Yield was 100% today', '2026-10-02', 'day')`;
      await tx`insert into public.entries (title, entry_date, entry_precision) values ('Yield was 100 today', '2026-10-03', 'day')`;
      const pct = await getJournal(tx, { q: "100%" });
      expect(pct.dated.map((x) => x.title)).toContain("Yield was 100% today");
      expect(pct.otherMatches).toEqual([]);
      const odd = await getJournal(tx, { project: "abc", from: "2026-13", to: "2026-00" });
      expect(odd.dated.length).toBeGreaterThan(0);
    });
  });
});

describe("experiments", () => {
  it("a status change goes through the same version as the text, so the next save isn't a conflict", async () => {
    const [e] = await withUser(u, async (tx) => {
      const rows = await tx`insert into public.entries (title, kind, entry_precision) values ('Trial', 'experiment', 'none') returning id`;
      await tx`insert into public.experiments (entry_id) values (${rows[0].id})`;
      return rows;
    });
    const s = crypto.randomUUID();
    const a = await updateExperiment(e.id, 1, s, { status: "unsuccessful" });
    expect(a.ok).toBe(true);
    const b = await updateExperiment(e.id, a.ok ? a.data.version : 0, s, { interpretation: "Buffer too weak" });
    expect(b.ok).toBe(true);
  });
});

describe("submissions", () => {
  it("an empty decision date keeps the one recorded; every change is in the history", async () => {
    const sub = await withUser(u, async (tx) => {
      const [m] = await tx`insert into public.manuscripts (title) values ('Draft') returning id`;
      const [s] = await tx`insert into public.submissions (manuscript_id, attempt_no, journal_name, status) values (${m.id}, 1, 'J. Test', 'submitted') returning id, version`;
      return s;
    });
    expect((await recordDecision(sub.id, form({ version: sub.version, status: "revise", decisionDate: "2026-10-01" }))).ok).toBe(true);
    expect((await recordDecision(sub.id, form({ version: sub.version + 1, status: "under_review", decisionDate: "" }))).ok).toBe(true);
    const [row] = await withUser(u, (tx) => tx`select decision_date, status from public.submissions where id = ${sub.id}`);
    expect(row).toEqual({ decisionDate: "2026-10-01", status: "under_review" });
    const stale = await recordDecision(sub.id, form({ version: sub.version, status: "accepted" }));
    expect(!stale.ok && stale.error.kind).toBe("conflict");
    const history = await withUser(u, (tx) => tx`select status from public.submission_events where submission_id = ${sub.id} order by recorded_at, id`);
    expect(history.map((h) => h.status)).toEqual(["submitted", "revise", "under_review"]);
  });
});

describe("edits check the version they started from", () => {
  it("tasks", async () => {
    const [t] = await withUser(u, (tx) => tx`insert into public.tasks (title) values ('Write intro') returning id, version`);
    expect((await updateTask(t.id, form({ version: t.version, title: "Write the intro" }))).ok).toBe(true);
    const stale = await updateTask(t.id, form({ version: t.version, title: "Old title" }));
    expect(!stale.ok && stale.error.kind).toBe("conflict");
  });

  it("milestones keep their done date and can change their target", async () => {
    const [m] = await withUser(u, (tx) => tx`insert into public.milestones (title, status, done_on, done_precision) values ('Synopsis', 'done', '2026-03-01', 'month') returning id, version`);
    const r = await updateMilestone(m.id, form({ version: m.version, status: "done", donePrecision: "month", doneMonth: "2026-03", targetPrecision: "month", targetMonth: "2027-06" }));
    expect(r.ok).toBe(true);
    const [row] = await withUser(u, (tx) => tx`select done_on, done_precision, target_date, target_precision from public.milestones where id = ${m.id}`);
    expect(row).toEqual({ doneOn: "2026-03-01", donePrecision: "month", targetDate: "2027-06-01", targetPrecision: "month" });
  });
});

describe("goals and Home", () => {
  it("goals go to Trash and come back", async () => {
    expect((await addGoal(form({ title: "Finish chapter 2", horizon: "month" }))).ok).toBe(true);
    const [g] = await withUser(u, (tx) => listGoals(tx));
    expect((await trashGoal(g.id)).ok).toBe(true);
    expect((await withUser(u, (tx) => listGoals(tx))).map((x) => x.id)).not.toContain(g.id);
    expect((await restoreFromTrash("goals", g.id)).ok).toBe(true);
    expect((await withUser(u, (tx) => listGoals(tx))).map((x) => x.id)).toContain(g.id);
  });

  it("isn't the first-day Home once anything is recorded, even with no journal entries", async () => {
    const other = await makeUser("features-empty");
    try {
      expect((await withUser(other, (tx) => getHome(tx, "2026-11-14"))).isEmpty).toBe(true);
      await withUser(other, (tx) => tx`insert into public.tasks (title, due_date) values ('Overdue thing', '2026-11-01')`);
      const home = await withUser(other, (tx) => getHome(tx, "2026-11-14"));
      expect(home.isEmpty).toBe(false);
      // overdue tasks are listed in Home's Reminders (in red), not under Needs attention
      const reminders = await withUser(other, (tx) => getReminders(tx, "2026-11-14"));
      expect(reminders.overdue.map((r) => r.title)).toContain("Overdue thing");
    } finally {
      await dropUser(other);
    }
  });
});
