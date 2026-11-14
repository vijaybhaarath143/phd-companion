import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/db";
import { admin, dropUser, makeUser, refused, withUser } from "./helpers";

/**
 * Rules added after the production-readiness audit (docs/production-audit-2026-11-14.md):
 * nothing is erased with a person's own token, history can't be forged, the nightly Trash
 * purge can't get stuck, orphaned stored files are queued for removal, and links stay
 * within one person's records.
 */
let u: SessionUser;
let other: SessionUser;

beforeAll(async () => {
  u = await makeUser("hardening");
  other = await makeUser("hardening-other");
});

afterAll(async () => {
  await admin`delete from app.storage_removals where owner_id in (${u.id}, ${other.id})`;
  await dropUser(u);
  await dropUser(other);
  await admin.end();
});

describe("nothing is erased with a person's own token", () => {
  it("refuses DELETE and TRUNCATE on her own records", async () => {
    await withUser(u, (tx) => tx`insert into public.entries (title, entry_precision) values ('Keep me', 'none')`);
    expect(await refused(u, (tx) => tx`delete from public.entries`)).toMatch(/permission denied/);
    expect(await refused(u, (tx) => tx`delete from public.tasks`)).toMatch(/permission denied/);
    expect(await refused(u, (tx) => tx`delete from public.attachments`)).toMatch(/permission denied/);
    expect(await refused(u, (tx) => tx`truncate public.entries cascade`)).toMatch(/permission denied/);
  });

  it("experiment revisions are written by the database only", async () => {
    const [e] = await withUser(u, (tx) => tx`insert into public.entries (title, kind, entry_precision) values ('Exp', 'experiment', 'none') returning id`);
    expect(await refused(u, (tx) => tx`
      insert into public.experiment_revisions (entry_id, revision_no, procedure, captured_at)
      values (${e.id}, 99, 'forged', '2020-01-01')`)).toMatch(/permission denied/);

    // the database still keeps earlier versions by itself
    await withUser(u, async (tx) => {
      await tx`insert into public.experiments (entry_id, procedure, last_edit_session) values (${e.id}, 'first', ${crypto.randomUUID()})`;
      await tx`update public.experiments set procedure = 'second', last_edit_session = ${crypto.randomUUID()} where entry_id = ${e.id}`;
    });
    const revs = await admin`select procedure from public.experiment_revisions where entry_id = ${e.id}`;
    expect(revs.map((r) => r.procedure)).toEqual(["first"]);
  });

  it("the current phase moves only through a recorded phase change", async () => {
    const [m] = await withUser(u, (tx) => tx`insert into public.manuscripts (title) values ('Paper') returning id`);
    expect(await refused(u, (tx) => tx`update public.manuscripts set current_phase = 'published' where id = ${m.id}`)).toMatch(/phase changes only/);
    await withUser(u, (tx) => tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind) values (${m.id}, 'writing', 'change')`);
    const [row] = await admin`select current_phase from public.manuscripts where id = ${m.id}`;
    expect(row.currentPhase).toBe("writing");
    // other fields still save normally
    await withUser(u, (tx) => tx`update public.manuscripts set title = 'Paper, renamed' where id = ${m.id}`);
  });
});

describe("Trash purge", () => {
  it("isn't stopped by a note linked to a purged project — the note stays, unlinked", async () => {
    const ids = await withUser(u, async (tx) => {
      const [p] = await tx`insert into public.projects (title) values ('Old project') returning id`;
      const [n] = await tx`insert into public.notes (title, project_id) values ('Linked note', ${p.id}) returning id`;
      await tx`update public.projects set deleted_at = now() - interval '40 days' where id = ${p.id}`;
      return { p: p.id, n: n.id };
    });
    await admin`select app.purge_trash()`;
    expect(await admin`select 1 from public.projects where id = ${ids.p}`).toHaveLength(0);
    const [n] = await admin`select project_id, deleted_at from public.notes where id = ${ids.n}`;
    expect(n.projectId).toBeNull();
    expect(n.deletedAt).toBeNull();
  });

  it("removes notes after 30 days in Trash, and the files of trials whose experiment was purged", async () => {
    const ids = await withUser(u, async (tx) => {
      const [n] = await tx`insert into public.notes (title, deleted_at) values ('Old note', now() - interval '40 days') returning id`;
      const [x] = await tx`insert into public.entries (title, kind, entry_precision) values ('Old exp', 'experiment', 'none') returning id`;
      const [t] = await tx`insert into public.experiment_trials (entry_id, trial_no) values (${x.id}, 1) returning id`;
      const [a] = await tx`insert into public.attachments (parent_type, parent_id, kind, storage_path, filename, status)
                           values ('trial', ${t.id}, 'file', ${`${u.id}/${crypto.randomUUID()}/run.csv`}, 'run.csv', 'verified') returning id, storage_path`;
      await tx`update public.entries set deleted_at = now() - interval '40 days' where id = ${x.id}`;
      return { n: n.id, x: x.id, a: a.id, path: a.storagePath as string };
    });
    await admin`select app.purge_trash()`;
    await admin`select app.purge_notes_and_trials()`;
    expect(await admin`select 1 from public.notes where id = ${ids.n}`).toHaveLength(0);
    expect(await admin`select 1 from public.experiment_trials where entry_id = ${ids.x}`).toHaveLength(0);
    expect(await admin`select 1 from public.attachments where id = ${ids.a}`).toHaveLength(0);
    expect(await admin`select 1 from app.storage_removals where path = ${ids.path}`).toHaveLength(1);
  });

  it("doesn't get stuck on a task waiting on a purged task", async () => {
    const ids = await withUser(u, async (tx) => {
      const [a] = await tx`insert into public.tasks (title, deleted_at) values ('Old trashed', now() - interval '40 days') returning id`;
      const [b] = await tx`insert into public.tasks (title, status, waiting_reason, waiting_on_task_id) values ('Waiting', 'waiting', 'needs A', ${a.id}) returning id`;
      return { a: a.id, b: b.id };
    });
    await admin`select app.purge_trash()`;
    expect(await admin`select 1 from public.tasks where id = ${ids.a}`).toHaveLength(0);
    const [b] = await admin`select status, waiting_reason, waiting_on_task_id from public.tasks where id = ${ids.b}`;
    expect(b.waitingOnTaskId).toBeNull();
    expect(b.status).toBe("waiting");
    expect(b.waitingReason).toBe("needs A");
  });

  it("queues the stored files of purged records, and of uploads that never finished", async () => {
    const ids = await withUser(u, async (tx) => {
      const [e] = await tx`insert into public.entries (title, entry_precision, deleted_at) values ('Old with file', 'none', now() - interval '40 days') returning id`;
      const purged = `${u.id}/${crypto.randomUUID()}/old.pdf`;
      await tx`insert into public.attachments (parent_type, parent_id, kind, storage_path, filename) values ('entry', ${e.id}, 'file', ${purged}, 'old.pdf')`;
      const [live] = await tx`insert into public.entries (title, entry_precision) values ('Live', 'none') returning id`;
      const stale = `${u.id}/${crypto.randomUUID()}/stale.pdf`;
      await tx`insert into public.attachments (parent_type, parent_id, kind, storage_path, filename, status, created_at)
               values ('entry', ${live.id}, 'file', ${stale}, 'stale.pdf', 'pending', now() - interval '2 days')`;
      return { purged, stale };
    });
    await admin`select app.purge_trash()`;
    const queued = await withUser(u, (tx) => tx<{ path: string }[]>`select app.my_storage_removals(500) as path`);
    expect(queued.map((r) => r.path)).toEqual(expect.arrayContaining([ids.purged, ids.stale]));
    // another person sees none of them
    expect(await withUser(other, (tx) => tx`select app.my_storage_removals(500)`)).toHaveLength(0);

    await withUser(u, (tx) => tx`select app.forget_storage_removals(${[ids.purged, ids.stale]})`);
    const after = await withUser(u, (tx) => tx<{ path: string }[]>`select app.my_storage_removals(500) as path`);
    expect(after.map((r) => r.path)).not.toContain(ids.purged);
  });

  it("purges courses and goals left in Trash, keeping their tasks", async () => {
    const ids = await withUser(u, async (tx) => {
      const [c] = await tx`insert into public.courses (name, deleted_at) values ('Dropped course', now() - interval '40 days') returning id`;
      await tx`insert into public.credit_recognitions (course_id, amount) values (${c.id}, 2)`;
      const [t] = await tx`insert into public.tasks (title, course_id) values ('Course task', ${c.id}) returning id`;
      const [g] = await tx`insert into public.goals (title, horizon, deleted_at) values ('Old goal', 'week', now() - interval '40 days') returning id`;
      const [g2] = await tx`insert into public.goals (title, horizon, deleted_at) values ('Recent goal', 'week', now() - interval '1 day') returning id`;
      return { c: c.id, t: t.id, g: g.id, g2: g2.id };
    });
    await admin`select app.purge_trash()`;
    expect(await admin`select 1 from public.courses where id = ${ids.c}`).toHaveLength(0);
    const [t] = await admin`select course_id from public.tasks where id = ${ids.t}`;
    expect(t.courseId).toBeNull();
    expect(await admin`select id from public.goals where id in (${ids.g}, ${ids.g2})`).toEqual([{ id: ids.g2 }]);
  });

  it("only files that aren't evidence may be removed from storage", async () => {
    const r = await withUser(u, async (tx) => {
      const [e] = await tx`insert into public.entries (title, entry_precision) values ('Evidence', 'none') returning id`;
      const verified = `${u.id}/${crypto.randomUUID()}/kept.pdf`;
      const failed = `${u.id}/${crypto.randomUUID()}/bad.pdf`;
      await tx`insert into public.attachments (parent_type, parent_id, kind, storage_path, filename) values ('entry', ${e.id}, 'file', ${verified}, 'kept.pdf')`;
      await tx`insert into public.attachments (parent_type, parent_id, kind, storage_path, filename, status) values ('entry', ${e.id}, 'file', ${failed}, 'bad.pdf', 'failed')`;
      const [x] = await tx`select app.may_remove_object(${verified}) as v, app.may_remove_object(${failed}) as f`;
      return x;
    });
    expect(r.v).toBe(false);
    expect(r.f).toBe(true);
  });
});

describe("links stay within one person's records", () => {
  it("refuses an attachment on someone else's record", async () => {
    const [e] = await withUser(u, (tx) => tx`insert into public.entries (title, entry_precision) values ('Mine', 'none') returning id`);
    expect(await refused(other, (tx) => tx`
      insert into public.attachments (parent_type, parent_id, kind, url) values ('entry', ${e.id}, 'link', 'https://example.org')`)).toMatch(/wasn't found/);
  });

  it("refuses a phase correction that points at someone else's phase change", async () => {
    const ev = await withUser(u, async (tx) => {
      const [m] = await tx`insert into public.manuscripts (title) values ('Mine') returning id`;
      const [x] = await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind) values (${m.id}, 'writing', 'change') returning id`;
      return x.id as string;
    });
    expect(await refused(other, async (tx) => {
      const [m] = await tx`insert into public.manuscripts (title) values ('Theirs') returning id`;
      await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind, corrects_event_id) values (${m.id}, 'writing', 'correction', ${ev})`;
    })).toMatch(/foreign key/);
  });
});

describe("submission history", () => {
  it("keeps every status and decision date, read-only", async () => {
    const s = await withUser(u, async (tx) => {
      const [m] = await tx`insert into public.manuscripts (title) values ('Submitted paper') returning id`;
      const [s] = await tx`insert into public.submissions (manuscript_id, attempt_no, journal_name) values (${m.id}, 1, 'J Food Sci') returning id`;
      await tx`update public.submissions set status = 'revise', decision_date = '2026-10-01' where id = ${s.id}`;
      await tx`update public.submissions set status = 'accepted', decision_date = null where id = ${s.id}`;
      return s.id as string;
    });
    const rows = await withUser(u, (tx) => tx`select status, decision_date from public.submission_events where submission_id = ${s} order by recorded_at, id`);
    expect(rows.map((r) => r.status)).toEqual(["submitted", "revise", "accepted"]);
    expect(rows[1].decisionDate).toBe("2026-10-01");
    expect(await refused(u, (tx) => tx`update public.submission_events set status = 'rejected'`)).toMatch(/permission denied/);
    expect(await refused(u, (tx) => tx`insert into public.submission_events (owner_id, submission_id, status) values (auth.uid(), ${s}, 'accepted')`)).toMatch(/permission denied/);
    expect(await withUser(other, (tx) => tx`select 1 from public.submission_events where submission_id = ${s}`)).toHaveLength(0);
  });
});

describe("her today", () => {
  it("uses her time zone, not the database clock", async () => {
    await withUser(u, (tx) => tx`insert into public.profiles (user_id, timezone) values (auth.uid(), 'Pacific/Kiritimati') on conflict (user_id) do update set timezone = excluded.timezone`);
    const [r] = await withUser(u, (tx) => tx`select app.user_today()::text as d, ((now() at time zone 'Pacific/Kiritimati')::date)::text as want`);
    expect(r.d).toBe(r.want);
  });
});
