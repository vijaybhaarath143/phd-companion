import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/db";
import { getJournal, getEntry } from "@/server/journal";
import { getHome } from "@/server/home";
import { getProjectBundle, getManuscriptBundle } from "@/server/research";
import { listTasks } from "@/server/planner";
import { getAcademics } from "@/server/academics";
import { admin, dropUser, makeUser, refused, withUser } from "./helpers";

/**
 * The most important property of the app: one person's research never reaches
 * another account — through tables, search, home, history or links.
 */
const TABLES = [
  "profiles", "projects", "entries", "experiments", "experiment_revisions", "feedback", "enquiries", "events",
  "manuscripts", "manuscript_phase_events", "submissions", "submission_events", "blockers", "tasks", "goals", "requirements",
  "courses", "credit_recognitions", "milestones", "attachments",
];

let alice: SessionUser;
let bob: SessionUser;
const ids: Record<string, string> = {};

beforeAll(async () => {
  alice = await makeUser("alice");
  bob = await makeUser("bob");

  // Alice records one of everything, as herself
  await withUser(alice, async (tx) => {
    await tx`insert into public.profiles (user_id, display_name, onboarded_at) values (auth.uid(), 'Alice', now())`;
    const [p] = await tx`insert into public.projects (title) values ('Alice secret project') returning id`;
    ids.project = p.id;
    const [e] = await tx`insert into public.entries (title, description, entry_precision, project_id) values ('Alice private entry', 'unpublished starch result', 'none', ${p.id}) returning id`;
    ids.entry = e.id;
    const [x] = await tx`insert into public.entries (title, kind, entry_precision) values ('Alice experiment', 'experiment', 'none') returning id`;
    ids.experiment = x.id;
    await tx`insert into public.experiments (entry_id, procedure) values (${x.id}, 'v1')`;
    await tx`update public.experiments set procedure = 'v2', last_edit_session = gen_random_uuid() where entry_id = ${x.id}`;
    const [m] = await tx`insert into public.manuscripts (title, project_id) values ('Alice manuscript', ${p.id}) returning id`;
    ids.manuscript = m.id;
    await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind) values (${m.id}, 'writing', 'change')`;
    await tx`insert into public.submissions (manuscript_id, attempt_no, journal_name) values (${m.id}, 1, 'Alice Journal')`;
    const [f] = await tx`insert into public.entries (title, kind, entry_precision) values ('Alice feedback', 'feedback', 'none') returning id`;
    await tx`insert into public.feedback (entry_id, manuscript_id, requested_changes) values (${f.id}, ${m.id}, 'redo fig 2')`;
    const [q] = await tx`insert into public.entries (title, kind, entry_precision) values ('Alice enquiry', 'enquiry', 'none') returning id`;
    await tx`insert into public.enquiries (entry_id, office) values (${q.id}, 'Registrar')`;
    await tx`insert into public.events (entry_id, award) values (${e.id}, 'Alice award')`;
    await tx`insert into public.blockers (entry_id, description) values (${x.id}, 'Alice blocker')`;
    const [t] = await tx`insert into public.tasks (title, project_id) values ('Alice task', ${p.id}) returning id`;
    ids.task = t.id;
    await tx`insert into public.goals (title, horizon) values ('Alice goal', 'month')`;
    await tx`insert into public.requirements (label, required_credits) values ('Alice credits', 12)`;
    const [c] = await tx`insert into public.courses (name, credits, status) values ('Alice course', 4, 'completed') returning id`;
    ids.course = c.id;
    await tx`insert into public.credit_recognitions (course_id, amount) values (${c.id}, 2)`;
    await tx`insert into public.milestones (title) values ('Alice milestone')`;
    await tx`insert into public.attachments (parent_type, parent_id, kind, url) values ('entry', ${e.id}, 'link', 'https://example.com/alice')`;
  });
});

afterAll(async () => {
  await dropUser(alice);
  await dropUser(bob);
  await admin.end();
});

describe("another account sees none of Alice's records", () => {
  it.each(TABLES)("%s: Bob reads 0 rows", async (table) => {
    const rows = await withUser(bob, (tx) => tx`select 1 from ${tx("public." + table)}`);
    expect(rows.length).toBe(0);
  });

  it("Alice herself can read every table she wrote to", async () => {
    for (const table of TABLES) {
      const rows = await withUser(alice, (tx) => tx`select 1 from ${tx("public." + table)}`);
      expect(rows.length, table).toBeGreaterThan(0);
    }
  });

  it("search, Home, project, manuscript, planner and academics views show Bob nothing of Alice's", async () => {
    await withUser(bob, async (tx) => {
      const j = await getJournal(tx, { q: "starch" });
      expect(j.dated.length + j.undated.length + j.otherMatches.length).toBe(0);
      expect((await getJournal(tx, {})).undated.length).toBe(0);
      expect(await getEntry(tx, ids.entry)).toBeNull();
      expect(await getProjectBundle(tx, ids.project)).toBeNull();
      expect(await getManuscriptBundle(tx, ids.manuscript)).toBeNull();
      expect(await listTasks(tx, "open")).toHaveLength(0);
      const home = await getHome(tx, "2026-11-14");
      expect(home.workingOn).toHaveLength(0);
      expect(home.recent).toHaveLength(0);
      const a = await getAcademics(tx);
      expect(a.courses).toHaveLength(0);
      expect(a.credits).toBeNull();
    });
  });
});

describe("another account can't change or borrow Alice's records", () => {
  it("updates and deletes by Bob touch nothing", async () => {
    await withUser(bob, async (tx) => {
      expect((await tx`update public.entries set title = 'hacked' where id = ${ids.entry} returning id`).length).toBe(0);
      expect((await tx`update public.tasks set status = 'done' where id = ${ids.task} returning id`).length).toBe(0);
    });
    const [e] = await admin`select title from public.entries where id = ${ids.entry}`;
    expect(e.title).toBe("Alice private entry");
  });

  it("Bob can't write a row that claims to be Alice's", async () => {
    const msg = await refused(bob, (tx) => tx`insert into public.entries (owner_id, title) values (${alice.id}, 'forged')`);
    expect(msg).toMatch(/row-level security/);
  });

  it("Bob can't link his own records to Alice's project, manuscript or course", async () => {
    expect(await refused(bob, (tx) => tx`insert into public.entries (title, project_id) values ('mine', ${ids.project})`)).toMatch(/foreign key/);
    expect(await refused(bob, (tx) => tx`insert into public.tasks (title, manuscript_id) values ('mine', ${ids.manuscript})`)).toMatch(/foreign key/);
    expect(await refused(bob, (tx) => tx`insert into public.credit_recognitions (course_id, amount) values (${ids.course}, 1)`)).toMatch(/foreign key/);
  });

  it("Bob can't read or write files in Alice's storage folder", async () => {
    await withUser(bob, async (tx) => {
      const objs = await tx`select 1 from storage.objects where bucket_id = 'evidence' and name like ${alice.id + "/%"}`;
      expect(objs.length).toBe(0);
    });
    const msg = await refused(bob, (tx) => tx`insert into storage.objects (bucket_id, name, owner_id) values ('evidence', ${alice.id + "/x/forged.pdf"}, ${bob.id})`);
    expect(msg).toMatch(/row-level security/);
  });

  it("a signed-out visitor (no identity) sees nothing", async () => {
    // anon has no grant at all on app tables
    await expect(
      admin.begin(async (tx) => {
        await tx`set local role anon`;
        return tx`select 1 from public.entries`;
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
