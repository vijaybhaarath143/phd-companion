import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/db";
import { getJournal } from "@/server/journal";
import { getCredits } from "@/server/home";
import { admin, dropUser, makeUser, refused, withUser } from "./helpers";

/** Rules that keep the research history truthful, enforced by the database itself. */
let u: SessionUser;

beforeAll(async () => {
  u = await makeUser("history");
});

afterAll(async () => {
  await dropUser(u);
  await admin.end();
});

describe("dates", () => {
  it("refuses a month-only date that secretly carries a day", async () => {
    expect(await refused(u, (tx) => tx`insert into public.entries (title, entry_date, entry_precision) values ('x', '2027-01-15', 'month')`)).toMatch(/entry_date_ok/);
  });

  it("refuses 'no date' with a date, and 'exact' without one", async () => {
    expect(await refused(u, (tx) => tx`insert into public.entries (title, entry_date, entry_precision) values ('x', '2027-01-01', 'none')`)).toMatch(/entry_date_ok/);
    expect(await refused(u, (tx) => tx`insert into public.entries (title, entry_precision) values ('x', 'day')`)).toMatch(/entry_date_ok/);
  });

  it("keeps undated entries out of the timeline but searchable, and labels partial overlaps", async () => {
    await withUser(u, async (tx) => {
      await tx`insert into public.entries (title, entry_precision) values ('Undated hackathon idea', 'none')`;
      await tx`insert into public.entries (title, entry_date, entry_precision) values ('Karaikudi programme', '2027-01-01', 'month')`;
      const all = await getJournal(tx, {});
      expect(all.undated.map((e) => e.title)).toContain("Undated hackathon idea");
      expect(all.dated.map((e) => e.title)).not.toContain("Undated hackathon idea");
      expect((await getJournal(tx, { q: "hackathon" })).undated).toHaveLength(1);

      // January 2027 (day unknown) only partly overlaps a range ending in... January — fully inside
      const jan = await getJournal(tx, { from: "2027-01", to: "2027-01" });
      expect(jan.partial.size).toBe(0);
      // ...but a range from February can't include it at all
      expect((await getJournal(tx, { from: "2027-02", to: "2027-03" })).dated).toHaveLength(0);
    });
  });
});

describe("experiments keep earlier versions", () => {
  it("groups typing in one session, keeps the previous text when a new session changes it", async () => {
    const s1 = crypto.randomUUID();
    const s2 = crypto.randomUUID();
    const revs = await withUser(u, async (tx) => {
      const [e] = await tx`insert into public.entries (title, kind, entry_precision) values ('Trial', 'experiment', 'none') returning id`;
      await tx`insert into public.experiments (entry_id) values (${e.id})`;
      await tx`update public.experiments set procedure = '10 mL', last_edit_session = ${s1} where entry_id = ${e.id}`;
      await tx`update public.experiments set procedure = '10 mL buffer', last_edit_session = ${s1} where entry_id = ${e.id}`;
      await tx`update public.experiments set procedure = '20 mL buffer', last_edit_session = ${s2} where entry_id = ${e.id}`;
      return tx`select revision_no, procedure from public.experiment_revisions where entry_id = ${e.id} order by revision_no`;
    });
    expect(revs).toEqual([{ revisionNo: 1, procedure: "10 mL buffer" }]);
  });

  it("earlier versions can't be edited or deleted", async () => {
    expect(await refused(u, (tx) => tx`update public.experiment_revisions set procedure = 'rewritten'`)).toMatch(/permission denied/);
    expect(await refused(u, (tx) => tx`delete from public.experiment_revisions`)).toMatch(/permission denied/);
  });
});

describe("manuscript history", () => {
  it("recording an earlier change never moves the current phase", async () => {
    const phase = await withUser(u, async (tx) => {
      const [m] = await tx`insert into public.manuscripts (title) values ('SLR draft') returning id`;
      await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind) values (${m.id}, 'review', 'change')`;
      await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind, effective_date, effective_precision)
               values (${m.id}, 'writing', 'earlier_change', '2026-08-01', 'month')`;
      const [row] = await tx`select current_phase from public.manuscripts where id = ${m.id}`;
      return row.currentPhase;
    });
    expect(phase).toBe("review");
  });

  it("phase history can't be edited or deleted", async () => {
    expect(await refused(u, (tx) => tx`update public.manuscript_phase_events set phase = 'published'`)).toMatch(/permission denied/);
    expect(await refused(u, (tx) => tx`delete from public.manuscript_phase_events`)).toMatch(/permission denied/);
  });

  it("each journal is its own attempt; numbers can't repeat", async () => {
    expect(await refused(u, (tx) => tx`
      with m as (insert into public.manuscripts (title) values ('Two attempts') returning id)
      insert into public.submissions (manuscript_id, attempt_no, journal_name)
      select id, 1, 'Journal A' from m union all select id, 1, 'Journal B' from m`)).toMatch(/duplicate key/);
  });
});

describe("tasks and credits", () => {
  it("a task can't wait on itself, directly or in a loop", async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    expect(await refused(u, async (tx) => {
      await tx`insert into public.tasks (id, title) values (${a}, 'A')`;
      await tx`insert into public.tasks (id, title, waiting_on_task_id) values (${b}, 'B', ${a})`;
      await tx`update public.tasks set waiting_on_task_id = ${b} where id = ${a}`;
    })).toMatch(/wait on itself/);
    expect(await refused(u, (tx) => tx`insert into public.tasks (id, title, waiting_on_task_id) values (${a}, 'self', ${a})`)).toMatch(/wait on itself|not_self_waiting/);
  });

  it("completing a course records no recognition; recognition is explicit and can be partial", async () => {
    const credits = await withUser(u, async (tx) => {
      await tx`insert into public.requirements (label, required_credits) values ('Coursework', 12)`;
      const [c] = await tx`insert into public.courses (name, credits, status) values ('Research Methodology', 4, 'completed') returning id`;
      const before = (await getCredits(tx))!.summary;
      await tx`insert into public.credit_recognitions (course_id, amount) values (${c.id}, 2)`;
      const after = (await getCredits(tx))!.summary;
      return { before, after };
    });
    expect(credits.before.completed.known).toBe(4);
    expect(credits.before.recognised).toBe(0);
    expect(credits.after.recognised).toBe(2);
  });

  it("an unknown credit value is stored as unknown, not zero", async () => {
    const s = await withUser(u, async (tx) => {
      await tx`insert into public.courses (name, credits, status) values ('SWAYAM course', null, 'enrolled')`;
      return (await getCredits(tx))!.summary;
    });
    expect(s.incomplete).toBe(true);
    expect(s.enrolled.unknownCourses).toBe(1);
  });
});

describe("Journal paging", () => {
  it("shows a page of dated entries and says when older ones exist", async () => {
    const page = await withUser(u, async (tx) => {
      for (let i = 1; i <= 55; i++) {
        const day = String((i % 28) + 1).padStart(2, "0");
        await tx`insert into public.entries (title, entry_date, entry_precision) values (${`Paged ${i}`}, ${`2025-03-${day}`}, 'day')`;
      }
      return getJournal(tx, { limit: 50 });
    });
    expect(page.dated).toHaveLength(50);
    expect(page.hasOlder).toBe(true);
  });
});

describe("Trash", () => {
  it("removes items deleted over 30 days ago, keeps recent ones, and only the system can run it", async () => {
    const ids = await withUser(u, async (tx) => {
      const [p] = await tx`insert into public.projects (title, deleted_at) values ('Old trashed project', now() - interval '31 days') returning id`;
      const [keep] = await tx`insert into public.entries (title, entry_precision, project_id) values ('Kept entry in trashed project', 'none', ${p.id}) returning id`;
      const [old] = await tx`insert into public.entries (title, entry_precision, deleted_at) values ('Old trash', 'none', now() - interval '31 days') returning id`;
      const [recent] = await tx`insert into public.entries (title, entry_precision, deleted_at) values ('Recent trash', 'none', now() - interval '2 days') returning id`;
      const [t] = await tx`insert into public.tasks (title, origin_entry_id) values ('Task from old trash', ${old.id}) returning id`;
      return { p: p.id, keep: keep.id, old: old.id, recent: recent.id, t: t.id };
    });

    expect(await refused(u, (tx) => tx`select app.purge_trash()`)).toMatch(/permission denied/);
    await admin`select app.purge_trash()`;

    const left = await admin`select id, project_id from public.entries where id in ${admin([ids.keep, ids.old, ids.recent])}`;
    expect(left.map((r) => r.id).sort()).toEqual([ids.keep, ids.recent].sort());
    expect(left.find((r) => r.id === ids.keep)!.projectId).toBeNull(); // unlinked, not deleted
    expect(await admin`select 1 from public.projects where id = ${ids.p}`).toHaveLength(0);
    const [task] = await admin`select origin_entry_id from public.tasks where id = ${ids.t}`;
    expect(task.originEntryId).toBeNull(); // task kept, link to the purged entry dropped
  });
});
