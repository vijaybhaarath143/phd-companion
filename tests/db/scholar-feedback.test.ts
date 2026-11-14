import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/db";
import { admin, dropUser, makeUser, refused, withUser } from "./helpers";

/**
 * The scholar-feedback features (Nov 2026), run as a real account against the local database:
 * priorities and "keep reminding", Home reminders and calendar, review steps and PRISMA
 * numbers, course deadlines, admin details, notes, trials and article types.
 */
let u: SessionUser;

vi.mock("@/server/auth", () => ({
  asUser: <T,>(fn: (tx: import("@/server/db").Tx, user: SessionUser) => Promise<T>) => withUser(u, (tx) => fn(tx, u)),
  requireUser: async () => u,
}));
vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), redirect: () => {} }));

const { createTask, updateTask } = await import("@/server/actions/tasks");
const { setUpReviewSteps, updateReviewStep, toggleReviewStep, addTrial, updateTrial, removeTrial, setArticleType, createManuscript } = await import("@/server/actions/research");
const { addCourseItem, toggleCourseItem, saveAdminDetails } = await import("@/server/actions/academics");
const { saveNote } = await import("@/server/actions/notes");
const { getReminders, getHomeCalendar, getAreas, getRecentUpdates } = await import("@/server/home");
const { undoRemove } = await import("@/server/actions/settings");
const { getReviewSteps, prismaNumbers, getTrials, listPublications } = await import("@/server/research");
const { listTasks } = await import("@/server/planner");
const { getAcademics } = await import("@/server/academics");
const { getNote, listNotes } = await import("@/server/notes");
const { getJournal } = await import("@/server/journal");
const { getEvents } = await import("@/server/events");
const { getTimeline } = await import("@/server/timeline");

function form(fields: Record<string, string | number | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.set(k, String(v));
  }
  return f;
}

const TODAY = "2026-11-14";
let projectId: string;
let courseId: string;
let experimentId: string;

beforeAll(async () => {
  u = await makeUser("feedback");
  await withUser(u, async (tx) => {
    await tx`insert into public.profiles (user_id, display_name, onboarded_at) values (auth.uid(), 'Scholar', now())`;
    const [p] = await tx`insert into public.projects (title, type) values ('SLR 9: Test review', 'systematic_review') returning id`;
    projectId = p.id;
    const [c] = await tx`insert into public.courses (name, provider, credits, status) values ('Research Methodology', 'SWAYAM', 4, 'enrolled') returning id`;
    courseId = c.id;
    const [x] = await tx`insert into public.entries (title, kind, category, entry_precision) values ('Starch assay', 'experiment', 'experiment', 'none') returning id`;
    experimentId = x.id;
    await tx`insert into public.experiments (entry_id) values (${x.id})`;
  });
});

afterAll(async () => {
  await dropUser(u);
  await admin.end();
});

describe("task priority and keep reminding", () => {
  it("accepts high / normal / low, refuses the old 'important', and sorts High first", async () => {
    expect((await createTask({ id: crypto.randomUUID(), title: "Low one", dueDate: null, priority: "low", projectId: null, notes: null })).ok).toBe(true);
    expect((await createTask({ id: crypto.randomUUID(), title: "High one", dueDate: null, priority: "high", projectId: null, notes: null, remindUntilDone: true })).ok).toBe(true);
    expect((await createTask({ id: crypto.randomUUID(), title: "Normal one", dueDate: null, priority: "normal", projectId: null, notes: null })).ok).toBe(true);
    const titles = (await withUser(u, (tx) => listTasks(tx, "open", 300, TODAY))).map((t) => t.title);
    expect(titles.indexOf("High one")).toBeLessThan(titles.indexOf("Normal one"));
    expect(titles.indexOf("Normal one")).toBeLessThan(titles.indexOf("Low one"));
    expect(await refused(u, (tx) => tx`insert into public.tasks (title, priority) values ('x', 'important')`)).toMatch(/priority_check/);
    const [high] = await admin`select remind_until_done from public.tasks where owner_id = ${u.id} and title = 'High one'`;
    expect(high.remindUntilDone).toBe(true);
  });

  it("the edit form can turn keep-reminding off", async () => {
    const [t] = await admin`select id, version from public.tasks where owner_id = ${u.id} and title = 'High one'`;
    const r = await updateTask(t.id, form({ version: t.version, title: "High one", status: "todo", priority: "high" }));
    expect(r.ok).toBe(true);
    const [after] = await admin`select remind_until_done from public.tasks where id = ${t.id}`;
    expect(after.remindUntilDone).toBe(false);
  });
});

describe("Home reminders and calendar", () => {
  it("groups by when, with overdue tasks and course deadlines first, and marks overdue days red", async () => {
    await createTask({ id: crypto.randomUUID(), title: "Late task", dueDate: "2026-11-09", priority: "normal", projectId: null, notes: null });
    await createTask({ id: crypto.randomUUID(), title: "Today task", dueDate: TODAY, priority: "normal", projectId: null, notes: null });
    await createTask({ id: crypto.randomUUID(), title: "Week task", dueDate: "2026-11-19", priority: "normal", projectId: null, notes: null });
    await createTask({ id: crypto.randomUUID(), title: "Later task", dueDate: "2026-12-30", priority: "normal", projectId: null, notes: null });
    expect((await addCourseItem(courseId, form({ kind: "assignment", title: "Week 3 assignment", dueDate: "2026-11-11" }))).ok).toBe(true);
    const g = await withUser(u, (tx) => getReminders(tx, TODAY));
    expect(g.overdue.map((r) => r.title)).toEqual(["Late task", "Week 3 assignment"]);
    expect(g.today.map((r) => r.title)).toEqual(["Today task"]);
    expect(g.week.map((r) => r.title)).toEqual(["Week task"]);
    expect(g.later.map((r) => r.title)).toEqual(["Later task"]);
    expect(g.undated.map((r) => r.title)[0]).toBe("High one");
    const cal = await withUser(u, (tx) => getHomeCalendar(tx, TODAY));
    expect(cal.overdueDays).toEqual([9, 11]);
    expect(cal.busyDays).toEqual(expect.arrayContaining([14, 19]));
  });

  it("a done deadline is no longer overdue", async () => {
    const [i] = await admin`select id from public.course_items where owner_id = ${u.id} and title = 'Week 3 assignment'`;
    expect((await toggleCourseItem(i.id, true)).ok).toBe(true);
    const g = await withUser(u, (tx) => getReminders(tx, TODAY));
    expect(g.overdue.map((r) => r.title)).toEqual(["Late task"]);
    expect((await withUser(u, (tx) => getHomeCalendar(tx, TODAY))).overdueDays).toEqual([9]);
  });

  it("areas count her records", async () => {
    const areas = await withUser(u, (tx) => getAreas(tx));
    expect(areas.find((a) => a.key === "benchwork")?.count).toBe(1);
    expect(areas.find((a) => a.key === "coursework")?.count).toBe(1);
  });
});

describe("review steps", () => {
  it("sets up the 11 steps once, and works out the PRISMA numbers", async () => {
    expect((await setUpReviewSteps(projectId)).ok).toBe(true);
    expect((await setUpReviewSteps(projectId)).ok).toBe(true); // a second click adds nothing
    let steps = await withUser(u, (tx) => getReviewSteps(tx, projectId));
    expect(steps).toHaveLength(11);
    expect(steps[0].title).toBe("Protocol drafting");

    const retrieve = steps.find((s) => s.countKind === "identified")!;
    const dupes = steps.find((s) => s.countKind === "duplicates_removed")!;
    expect((await updateReviewStep(retrieve.id, form({ version: retrieve.version, status: "done", count: 412 }))).ok).toBe(true);
    expect((await updateReviewStep(dupes.id, form({ version: dupes.version, status: "in_progress", count: 37 }))).ok).toBe(true);
    expect((await updateReviewStep(dupes.id, form({ version: dupes.version, status: "done", count: 1 }))).ok).toBe(false); // stale version
    expect((await updateReviewStep(retrieve.id, form({ version: retrieve.version + 1, status: "done", count: "4.5" }))).ok).toBe(false);

    steps = await withUser(u, (tx) => getReviewSteps(tx, projectId));
    expect(steps.find((s) => s.id === retrieve.id)?.doneOn).toBeTruthy(); // done today by default
    const p = prismaNumbers(steps);
    expect(p).toMatchObject({ identified: 412, duplicates_removed: 37, screened: 375, included: null });

    expect((await toggleReviewStep(steps[0].id, true)).ok).toBe(true);
    expect((await withUser(u, (tx) => getReviewSteps(tx, projectId)))[0].status).toBe("done");
  });

  it("review projects show under review articles, even before they have a manuscript", async () => {
    const rows = await withUser(u, (tx) => listPublications(tx));
    expect(rows).toEqual([expect.objectContaining({ title: "SLR 9: Test review", articleType: "review", manuscriptId: null })]);
    await createManuscript(projectId, form({ title: "SLR 9 manuscript" }));
    const [m] = await admin`select id, article_type from public.manuscripts where owner_id = ${u.id}`;
    expect(m.articleType).toBe("review");
    expect((await setArticleType(m.id, "original")).ok).toBe(true);
    expect((await setArticleType(m.id, "poster")).ok).toBe(false);
  });
});

describe("academics: deadlines and admin details", () => {
  it("lists course deadlines and keeps admin details as label / value pairs", async () => {
    expect((await addCourseItem(courseId, form({ kind: "exam_registration", title: "", dueDate: "2026-12-01" }))).ok).toBe(true);
    const a = await withUser(u, (tx) => getAcademics(tx));
    expect(a.courseItems.map((i) => i.title)).toContain("Exam registration");
    expect((await saveAdminDetails(form({ label: ["Enrolment number", "", "Office"], value: ["PHD-001", "", "Room 4"] }))).ok).toBe(true);
    const [p] = await admin`select admin_details from public.profiles where user_id = ${u.id}`;
    expect(p.adminDetails).toEqual([{ label: "Enrolment number", value: "PHD-001" }, { label: "Office", value: "Room 4" }]);
  });
});

describe("notes", () => {
  it("autosaves with versions, keeps checklist items, and is found by search", async () => {
    const [n] = await withUser(u, (tx) => tx`insert into public.notes (kind, title) values ('checklist', 'Journals shortlisted') returning id, version`);
    const r = await saveNote(n.id, n.version, { items: [{ id: "a", text: "Biosensors and Bioelectronics", done: true }, { id: "b", text: "Food Chemistry", done: false }] });
    expect(r.ok).toBe(true);
    expect((await saveNote(n.id, n.version, { title: "stale" })).ok).toBe(false); // changed elsewhere
    const note = await withUser(u, (tx) => getNote(tx, n.id));
    expect(note?.items).toHaveLength(2);
    expect((await withUser(u, (tx) => listNotes(tx)))[0]).toMatchObject({ itemsTotal: 2, itemsDone: 1 });
    const j = await withUser(u, (tx) => getJournal(tx, { q: "Food Chemistry" }));
    expect(j.otherMatches.map((m) => m.kind)).toContain("Checklist");
  });
});

describe("experiment trials", () => {
  it("numbers trials, carries conditions forward, and hides removed ones", async () => {
    const t1 = await addTrial(experimentId);
    expect(t1.ok).toBe(true);
    const [row] = await admin`select id, version from public.experiment_trials where owner_id = ${u.id}`;
    expect((await updateTrial(row.id, form({ version: row.version, conditions: "pH 7, 25 °C", result: "peak at 0.4 V", outcome: "worked" }))).ok).toBe(true);
    expect((await addTrial(experimentId)).ok).toBe(true);
    let trials = await withUser(u, (tx) => getTrials(tx, experimentId));
    expect(trials.map((t) => t.trialNo)).toEqual([2, 1]);
    expect(trials[0].conditions).toBe("pH 7, 25 °C");
    expect((await removeTrial(trials[0].id)).ok).toBe(true);
    trials = await withUser(u, (tx) => getTrials(tx, experimentId));
    expect(trials.map((t) => t.trialNo)).toEqual([1]);
  });
});

describe("events", () => {
  it("splits upcoming, attended and missed", async () => {
    await withUser(u, async (tx) => {
      const [a] = await tx`insert into public.entries (title, kind, category, entry_date, entry_precision) values ('Future workshop', 'event', 'conference', '2027-01-10', 'day') returning id`;
      await tx`insert into public.events (entry_id, registration) values (${a.id}, 'registered')`;
      const [b] = await tx`insert into public.entries (title, kind, category, entry_date, entry_precision) values ('Past conference', 'event', 'conference', '2026-10-01', 'day') returning id`;
      await tx`insert into public.events (entry_id, participation) values (${b.id}, 'presented')`;
      const [c] = await tx`insert into public.entries (title, kind, category, entry_date, entry_precision) values ('Missed training', 'event', 'training', '2026-10-01', 'month') returning id`;
      await tx`insert into public.events (entry_id, registration, participation) values (${c.id}, 'registered', 'did_not_attend')`;
    });
    const ev = await withUser(u, (tx) => getEvents(tx, TODAY, null));
    expect(ev.upcoming.map((e) => e.title)).toEqual(["Future workshop"]);
    expect(ev.attended.map((e) => e.title)).toEqual(["Past conference"]);
    expect(ev.missed.map((e) => e.title)).toEqual(["Missed training"]);
    expect(ev.unrecorded).toHaveLength(0);
  });

  it("a past event with attendance not recorded is asked about, never counted as missed", async () => {
    await withUser(u, async (tx) => {
      const [e] = await tx`insert into public.entries (title, kind, category, entry_date, entry_precision) values ('Logged afterwards', 'event', 'conference', '2026-09-05', 'day') returning id`;
      await tx`insert into public.events (entry_id) values (${e.id})`;
    });
    const ev = await withUser(u, (tx) => getEvents(tx, TODAY, null));
    expect(ev.unrecorded.map((e) => e.title)).toEqual(["Logged afterwards"]);
    expect(ev.missed.map((e) => e.title)).not.toContain("Logged afterwards");
    expect((await withUser(u, (tx) => getEvents(tx, TODAY, "training"))).missed).toHaveLength(1);
  });
});

describe("the Timeline shows the new records", () => {
  it("lists trials run, review steps done and course deadlines", async () => {
    const { dated } = await withUser(u, (tx) => getTimeline(tx, { today: TODAY, timezone: "Asia/Kolkata", limit: 200 }));
    const labels = dated.map((i) => `${i.label}: ${i.title}`);
    expect(labels).toEqual(expect.arrayContaining([
      "Trial 1: Starch assay",
      "Review step done: Retrieve records",
      "Exam registration closes: Exam registration",
    ]));
    // a deadline that was ticked off shows as done, on the day it was done
    expect(labels.some((l) => l.startsWith("Assignment submitted: Week 3 assignment"))).toBe(true);
  });
});

describe("review fixes", () => {
  it("PRISMA numbers add up repeated counts, and a skipped duplicates step means none removed", () => {
    const step = (countKind: string | null, count: number | null, status = "done") => ({ countKind, count, status }) as Parameters<typeof prismaNumbers>[0][number];
    expect(prismaNumbers([step("identified", 300), step("identified", 112), step("duplicates_removed", 37)])).toMatchObject({ identified: 412, screened: 375 });
    expect(prismaNumbers([step("identified", 412), step("duplicates_removed", null, "skipped")])).toMatchObject({ duplicates_removed: 0, screened: 412 });
    expect(prismaNumbers([step("identified", 412)])).toMatchObject({ duplicates_removed: null, screened: null });
  });

  it("a High task with no date comes before Low tasks with dates (overdue still first)", async () => {
    await createTask({ id: crypto.randomUUID(), title: "Undated high", dueDate: null, priority: "high", projectId: null, notes: null });
    await createTask({ id: crypto.randomUUID(), title: "Dated low", dueDate: "2026-12-01", priority: "low", projectId: null, notes: null });
    const titles = (await withUser(u, (tx) => listTasks(tx, "open", 300, TODAY))).map((t) => t.title);
    expect(titles.indexOf("Late task")).toBe(0);
    expect(titles.indexOf("Undated high")).toBeLessThan(titles.indexOf("Dated low"));
  });

  it("a month-only event goes by the month's last day, and undated events wait under 'No date yet'", async () => {
    await withUser(u, async (tx) => {
      const [a] = await tx`insert into public.entries (title, kind, category, entry_date, entry_precision) values ('Next-month symposium', 'event', 'conference', '2026-12-01', 'month') returning id`;
      await tx`insert into public.events (entry_id) values (${a.id})`;
      const [b] = await tx`insert into public.entries (title, kind, category, entry_precision) values ('Hackathon, date tbc', 'event', 'competition', 'none') returning id`;
      await tx`insert into public.events (entry_id) values (${b.id})`;
    });
    const g = await withUser(u, (tx) => getReminders(tx, "2026-11-26"));
    expect(g.week.map((r) => r.title)).not.toContain("Next-month symposium");
    expect(g.later.map((r) => r.title)).toContain("Next-month symposium");
    expect(g.undated.map((r) => r.title)).toContain("Hackathon, date tbc");
  });

  it("recent updates are things that happened, not what's due", async () => {
    const items = await withUser(u, (tx) => getRecentUpdates(tx, TODAY, "Asia/Kolkata", 50));
    expect(items.some((i) => /due|closes/i.test(i.detail))).toBe(false);
    expect(items.length).toBeGreaterThan(0);
  });

  it("a removed trial comes back with Undo", async () => {
    const [t] = await admin`select id from public.experiment_trials where owner_id = ${u.id} and removed_at is not null limit 1`;
    expect((await undoRemove("trial", t.id)).ok).toBe(true);
    expect((await undoRemove("trial", t.id)).ok).toBe(false); // already back
    const [after] = await admin`select removed_at from public.experiment_trials where id = ${t.id}`;
    expect(after.removedAt).toBeNull();
  });
});
