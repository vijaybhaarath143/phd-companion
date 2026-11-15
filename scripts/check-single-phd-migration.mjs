// Checks what supabase/migrations/20261118000001_single_phd.sql does to every kind of project,
// before it runs on live data. Inside one transaction that is ALWAYS rolled back, it:
//   1. puts the schema back the way it was before that migration,
//   2. creates one person with every case (review project with and without a manuscript, a
//      project with one manuscript, lab work, a review project in Trash, files on projects),
//   3. runs the real migration file, and
//   4. checks where every step, entry, task, note and file ended up.
// Nothing is kept. Local databases only.
//
// Run: node --env-file=.env.local scripts/check-single-phd-migration.mjs

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { assertLocal } from "./lib/local-only.mjs";

assertLocal("The migration check");

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {}, transform: postgres.camel });
const migration = readFileSync(new URL("../supabase/migrations/20261118000001_single_phd.sql", import.meta.url), "utf8");
const failures = [];
const check = (ok, what) => (ok ? console.log(`  ✓ ${what}`) : failures.push(what));

class Rollback extends Error {}

try {
  await sql.begin(async (tx) => {
    // ---------------------------------------------------------------- 1. the schema before the migration
    await tx.unsafe(`
      delete from public.review_steps;
      drop index if exists public.review_steps_manuscript_sort, public.review_steps_manuscript, public.entries_manuscript, public.notes_manuscript;
      alter table public.review_steps drop constraint review_steps_has_parent;
      alter table public.review_steps drop constraint review_steps_manuscript_fkey;
      alter table public.review_steps drop column manuscript_id;
      alter table public.review_steps alter column project_id set not null;
      create unique index review_steps_project_sort on public.review_steps (owner_id, project_id, sort) where removed_at is null;
      alter table public.entries drop column manuscript_id;
      alter table public.notes drop column manuscript_id;
      alter table public.profiles drop column phd_title;
    `);

    // ---------------------------------------------------------------- 2. every case, for one person
    const me = randomUUID();
    await tx`insert into auth.users (id, email, aud, role) values (${me}, ${`migration-check-${me}@phd.test`}, 'authenticated', 'authenticated')`;
    const project = async (title, type, extra = {}) =>
      (await tx`insert into public.projects ${tx({ owner_id: me, title, type, ...extra })} returning id`)[0].id;
    const A = await project("SLR A: review without a manuscript", "systematic_review");
    const B = await project("Method B", "method_development");
    const C = await project("Laboratory work", "experimental");
    const D = await project("SLR D: trashed review", "narrative_review", { deleted_at: new Date() });
    const E = await project("SLR E: review with a manuscript", "systematic_review");

    const [bPaper] = await tx`insert into public.manuscripts (owner_id, project_id, title) values (${me}, ${B}, 'Method B paper') returning id`;
    const [eMs] = await tx`insert into public.manuscripts (owner_id, project_id, title) values (${me}, ${E}, 'SLR E manuscript') returning id`;

    for (const [p, sort, title] of [[A, 1, "Protocol"], [A, 2, "Search"], [D, 1, "Trashed step"], [E, 1, "E step"]]) {
      await tx`insert into public.review_steps (owner_id, project_id, sort, title) values (${me}, ${p}, ${sort}, ${title})`;
    }
    const [aEntry] = await tx`insert into public.entries (owner_id, title, entry_precision, project_id) values (${me}, 'A entry', 'none', ${A}) returning id`;
    const [cEntry] = await tx`insert into public.entries (owner_id, title, entry_precision, project_id) values (${me}, 'C entry', 'none', ${C}) returning id`;
    const [aTask] = await tx`insert into public.tasks (owner_id, title, project_id) values (${me}, 'A task', ${A}) returning id`;
    const [bTask] = await tx`insert into public.tasks (owner_id, title, project_id) values (${me}, 'B task', ${B}) returning id`;
    const [aNote] = await tx`insert into public.notes (owner_id, title, project_id) values (${me}, 'A note', ${A}) returning id`;
    const [aFile] = await tx`insert into public.attachments (owner_id, parent_type, parent_id, kind, url, label) values (${me}, 'project', ${A}, 'link', 'https://example.org/a', 'A link') returning id`;
    const [cFile] = await tx`insert into public.attachments (owner_id, parent_type, parent_id, kind, url, label) values (${me}, 'project', ${C}, 'link', 'https://example.org/c', 'C link') returning id`;

    // ---------------------------------------------------------------- 3. the real migration
    await tx.unsafe(migration);

    // ---------------------------------------------------------------- 4. where everything went
    const ms = async (projectId) => tx`select id, title, article_type, deleted_at from public.manuscripts where owner_id = ${me} and project_id = ${projectId} order by created_at`;
    const one = async (q) => (await q)[0];

    console.log("Review project without a manuscript (A):");
    const aMs = await ms(A);
    check(aMs.length === 1 && aMs[0].title === "SLR A: review without a manuscript" && aMs[0].articleType === "review" && aMs[0].deletedAt === null, "becomes one new review publication, outside Trash");
    const aId = aMs[0]?.id;
    check((await tx`select 1 from public.manuscript_phase_events where manuscript_id = ${aId} and phase = 'planning' and kind = 'change'`).length === 1, "the new publication starts in planning");
    const aSteps = await tx`select manuscript_id, project_id from public.review_steps where owner_id = ${me} and title in ('Protocol', 'Search')`;
    check(aSteps.length === 2 && aSteps.every((s) => s.manuscriptId === aId && s.projectId === null), "both steps move onto it and leave the project");
    check((await one(tx`select manuscript_id from public.entries where id = ${aEntry.id}`)).manuscriptId === aId, "its entry is tagged with it");
    check((await one(tx`select manuscript_id from public.tasks where id = ${aTask.id}`)).manuscriptId === aId, "its task is tagged with it");
    check((await one(tx`select manuscript_id from public.notes where id = ${aNote.id}`)).manuscriptId === aId, "its note is tagged with it");
    const af = await one(tx`select parent_type, parent_id from public.attachments where id = ${aFile.id}`);
    check(af.parentType === "manuscript" && af.parentId === aId, "its file moves onto the publication");

    console.log("Project with exactly one manuscript (B):");
    check((await ms(B)).length === 1, "no extra publication is created");
    check((await one(tx`select manuscript_id from public.tasks where id = ${bTask.id}`)).manuscriptId === bPaper.id, "its task is tagged with that manuscript");
    check((await one(tx`select article_type from public.manuscripts where id = ${bPaper.id}`)).articleType === null, "a non-review manuscript keeps its article type");

    console.log("Lab work, no manuscript (C):");
    check((await ms(C)).length === 0, "no publication is created");
    check((await one(tx`select manuscript_id from public.entries where id = ${cEntry.id}`)).manuscriptId === null, "its entry just loses the tag");
    const cf = await one(tx`select parent_type from public.attachments where id = ${cFile.id}`);
    check(cf.parentType === "project", "its file stays on the hidden project (the dry run reports these: stop and decide first)");

    console.log("Review project in Trash (D):");
    check((await ms(D)).length === 0, "no publication is created");
    const dStep = await one(tx`select manuscript_id, project_id from public.review_steps where owner_id = ${me} and title = 'Trashed step'`);
    check(dStep.manuscriptId === null && dStep.projectId === D, "its step stays with the trashed project (purged with it, as before)");

    console.log("Review project that already has a manuscript (E):");
    check((await ms(E)).length === 1, "no extra publication is created");
    check((await one(tx`select manuscript_id from public.review_steps where owner_id = ${me} and title = 'E step'`)).manuscriptId === eMs.id, "its step moves onto the existing manuscript");
    check((await one(tx`select article_type from public.manuscripts where id = ${eMs.id}`)).articleType === "review", "the manuscript is marked as a review");

    console.log("Everywhere:");
    check((await tx`select 1 from public.review_steps where manuscript_id is null and project_id is null`).length === 0, "no review step is left without a home");
    check((await tx`select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'phd_title'`).length === 1, "profiles get the PhD title");

    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) {
    console.error("The migration check could not run:", e.message);
    await sql.end();
    process.exit(1);
  }
}

await sql.end();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("\nAll migration checks passed (everything was rolled back).");
