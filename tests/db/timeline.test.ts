import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/db";
import { getTimeline } from "@/server/timeline";
import { admin, dropUser, makeUser, withUser } from "./helpers";

/** The Timeline feed: everything she recorded, in date order, and nobody else's. */
let u: SessionUser;
let other: SessionUser;
const today = "2026-11-14";
const opts = { today, timezone: "Asia/Kolkata" };
let projectId: string;
let entryWithFile: string;

beforeAll(async () => {
  u = await makeUser("timeline");
  other = await makeUser("timeline-other");
  await withUser(u, async (tx) => {
    const [p] = await tx`insert into public.projects (title, start_date, start_precision, created_at)
                          values ('SLR 1: Biosensors', '2026-06-01', 'month', '2026-06-20T10:00:00Z') returning id`;
    projectId = p.id;
    await tx`insert into public.entries (title, entry_date, entry_precision, project_id) values ('Guide meeting', '2026-10-05', 'day', ${projectId})`;
    await tx`insert into public.entries (title, entry_date, entry_precision) values ('World Food Day', '2026-10-01', 'month')`;
    await tx`insert into public.entries (title, entry_date, entry_precision) values ('Late October reading', '2026-10-28', 'day')`;
    await tx`insert into public.entries (title, entry_date, entry_precision, status) values ('Karaikudi programme', '2027-01-01', 'month', 'planned')`;
    await tx`insert into public.entries (title, entry_precision) values ('Undated hackathon idea', 'none')`;
    await tx`insert into public.entries (title, entry_date, entry_precision, deleted_at) values ('In the trash', '2026-10-10', 'day', now())`;
    await tx`insert into public.entries (title, entry_date, entry_precision, archived_at) values ('Archived note', '2026-10-11', 'day', now())`;

    const [e] = await tx`insert into public.entries (title, entry_date, entry_precision, created_at)
                         values ('Poster presentation', '2026-09-12', 'day', '2026-09-12T08:00:00Z') returning id`;
    entryWithFile = e.id;
    await tx`insert into public.attachments (parent_type, parent_id, kind, storage_path, filename, mime_type, size_bytes, created_at)
             values ('entry', ${e.id}, 'file', ${`${u.id}/x/certificate.pdf`}, 'certificate.pdf', 'application/pdf', 1000, '2026-11-02T08:00:00Z')`;
    await tx`insert into public.attachments (parent_type, parent_id, kind, url, label, created_at)
             values ('entry', ${e.id}, 'link', 'https://example.org/slides', 'Slides', '2026-09-12T09:00:00Z')`;
    await tx`insert into public.attachments (parent_type, parent_id, kind, url, label, removed_at)
             values ('entry', ${e.id}, 'link', 'https://example.org/old', 'Removed link', now())`;

    await tx`insert into public.tasks (title, due_date, project_id, created_at) values ('Shortlist a journal', '2026-12-01', ${projectId}, '2026-11-01T06:00:00Z')`;
    await tx`insert into public.tasks (title, status, completed_at, created_at) values ('Send figures', 'done', '2026-10-20T06:00:00Z', '2026-10-02T06:00:00Z')`;
    await tx`insert into public.tasks (title, due_date, deleted_at) values ('Deleted task', '2026-11-20', now())`;

    const [m] = await tx`insert into public.manuscripts (title, project_id, created_at) values ('SLR 1 manuscript', ${projectId}, '2026-08-03T06:00:00Z') returning id`;
    await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind, effective_precision, recorded_at) values (${m.id}, 'planning', 'change', 'none', '2026-08-03T06:00:10Z')`;
    await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind, effective_date, effective_precision) values (${m.id}, 'writing', 'earlier_change', '2026-09-01', 'month')`;
    await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind, effective_precision, note) values (${m.id}, 'review', 'change', 'none', 'Guide feedback pending')`;

    const [c] = await tx`insert into public.courses (name, provider, status, created_at) values ('Research Methodology', 'SWAYAM', 'enrolled', '2026-07-15T06:00:00Z') returning id`;
    await tx`insert into public.credit_recognitions (course_id, amount, recognised_precision) values (${c.id}, 2, 'none')`;
    await tx`insert into public.milestones (title, status, done_on, done_precision) values ('Provisional admission', 'done', '2026-06-01', 'month')`;
  });
});

afterAll(async () => {
  await dropUser(u);
  await dropUser(other);
  await admin.end();
});

const titles = (items: { title: string; label: string }[]) => items.map((i) => `${i.label}: ${i.title}`);

describe("timeline", () => {
  it("lists her records newest first, with month-only dates after the exact days of that month", async () => {
    const t = await withUser(u, (tx) => getTimeline(tx, opts));
    expect(titles(t.dated)).toEqual([
      "Journal entry: Karaikudi programme",
      "Task due: Shortlist a journal",
      "File added: certificate.pdf",
      "Task added: Shortlist a journal",
      "Journal entry: Late October reading",
      "Task done: Send figures",
      "Journal entry: Guide meeting",
      "Task added: Send figures",
      "Journal entry: World Food Day",
      "Journal entry: Poster presentation",
      "Manuscript: SLR 1 manuscript",
      "Manuscript added: SLR 1 manuscript",
      "Course added: Research Methodology",
      // same month, day not known: the one recorded most recently comes first
      "Milestone reached: Provisional admission",
      "Project started: SLR 1: Biosensors",
    ]);

    const byTitle = (s: string) => t.dated.find((i) => i.title === s)!;
    expect(byTitle("Karaikudi programme")).toMatchObject({ precision: "month", date: "2027-01-01", future: true });
    expect(byTitle("World Food Day")).toMatchObject({ precision: "month", future: false });
    expect(byTitle("Guide meeting")).toMatchObject({ precision: "day", href: expect.stringMatching(/^\/journal\//), detail: "SLR 1" });
    expect(byTitle("SLR 1 manuscript").detail).toBe("Moved to Writing · recorded later · SLR 1");
  });

  it("keeps undated things in their own group and never invents a day for them", async () => {
    const t = await withUser(u, (tx) => getTimeline(tx, opts));
    expect(titles(t.undated).sort()).toEqual([
      "Credits recognised: Research Methodology",
      "Journal entry: Undated hackathon idea",
      "Manuscript: SLR 1 manuscript",
    ]);
    expect(t.undated.every((i) => i.date === null && i.precision === "none")).toBe(true);
  });

  it("leaves out Trash, archive and removed files", async () => {
    const t = await withUser(u, (tx) => getTimeline(tx, opts));
    const all = [...t.dated, ...t.undated].map((i) => i.title);
    expect(all).not.toContain("In the trash");
    expect(all).not.toContain("Archived note");
    expect(all).not.toContain("Deleted task");
    const poster = t.dated.find((i) => i.title === "Poster presentation")!;
    expect(poster.attachments.map((a) => a.label ?? a.filename)).toEqual(["Slides", "certificate.pdf"]);
    expect(t.dated.find((i) => i.title === "certificate.pdf")).toMatchObject({ href: `/journal/${entryWithFile}`, detail: "On Poster presentation" });
  });

  it("filters by type, project and period", async () => {
    const tasks = await withUser(u, (tx) => getTimeline(tx, { ...opts, type: "task" }));
    expect(new Set(tasks.dated.map((i) => i.type))).toEqual(new Set(["task"]));
    expect(tasks.undated).toHaveLength(0);

    const slr = await withUser(u, (tx) => getTimeline(tx, { ...opts, project: projectId }));
    expect(titles(slr.dated)).toEqual([
      "Task due: Shortlist a journal",
      "Task added: Shortlist a journal",
      "Journal entry: Guide meeting",
      "Manuscript: SLR 1 manuscript",
      "Manuscript added: SLR 1 manuscript",
      "Project started: SLR 1: Biosensors",
    ]);

    const month = await withUser(u, (tx) => getTimeline(tx, { ...opts, period: "month" }));
    expect(titles(month.dated)).toEqual(["File added: certificate.pdf", "Task added: Shortlist a journal"]);
    expect(month.undated).toHaveLength(0);

    const year = await withUser(u, (tx) => getTimeline(tx, { ...opts, period: "year" }));
    expect(year.dated.map((i) => i.title)).not.toContain("Karaikudi programme");
  });

  it("shows older items page by page without cutting a month in half", async () => {
    await withUser(u, async (tx) => {
      for (let i = 0; i < 60; i++) await tx`insert into public.entries (title, entry_date, entry_precision) values (${`Old note ${i}`}, '2025-03-10', 'day')`;
    });
    const first = await withUser(u, (tx) => getTimeline(tx, { ...opts, limit: 50 }));
    expect(first.hasOlder).toBe(true);
    expect(first.dated.some((i) => i.date?.startsWith("2025-03"))).toBe(false);
    const more = await withUser(u, (tx) => getTimeline(tx, { ...opts, limit: 200 }));
    expect(more.hasOlder).toBe(false);
    expect(more.dated.filter((i) => i.date === "2025-03-10")).toHaveLength(60);
  });

  it("shows another person none of it", async () => {
    const t = await withUser(other, (tx) => getTimeline(tx, opts));
    expect(t.dated).toEqual([]);
    expect(t.undated).toEqual([]);
    // even when they ask for her project by id
    const p = await withUser(other, (tx) => getTimeline(tx, { ...opts, project: projectId }));
    expect(p.dated).toEqual([]);
  });
});
