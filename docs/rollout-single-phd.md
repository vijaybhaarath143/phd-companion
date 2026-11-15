# Rolling out "one PhD, no projects" (November 2026)

What ships: the scholar confirmed there's no such thing as a project — the whole PhD is the one
project. So projects are gone from every screen and dropdown, the PhD's title lives in the
profile, and what used to be projects move to where they belong:

| Was | Becomes |
|---|---|
| A review project (SLR 1, SLR 2), or any project with review steps | A **publication**. Its review steps and PRISMA numbers move onto it (a manuscript is created, in planning, if it had none). Entries, tasks, notes and files tagged with the project are tagged with that publication. |
| A project with exactly one manuscript | Its items are tagged with that manuscript. |
| Lab work and other projects | The tag just goes. Experiments are already under Benchwork. |
| A project already in Trash | Left as it is; purged when its 30 days are up, as before. |

Nothing else is deleted. The old `project_id` columns and the `projects` table stay, hidden, for
one release so the move can be checked; a later migration drops them.

One migration: `supabase/migrations/20261118000001_single_phd.sql`.

## Checked before it ships

`scripts/check-single-phd-migration.mjs` runs the real migration, inside a transaction that is
always rolled back, on every kind of project (review with and without a manuscript, a project
with one manuscript, lab work, a review in Trash, files on projects) and checks where each step,
entry, task, note and file lands. CI runs it on every pull request. Locally:
`node --env-file=.env.local scripts/check-single-phd-migration.mjs` (local databases only).

## Order — dry run, backup, migration, then the app straight after

Between the migration and the new app, the **old app shows no review steps** (they've moved to
publications) and can still create projects nobody will see. So run steps 3 and 4 together.

1. **Dry run.** Run `scripts/single-phd-dry-run.sql` in the Supabase SQL editor (read-only). One
   row per project: what it becomes and how many steps, entries, tasks, notes and files go with
   it. **Stop if** a "no publication" row has files — those files would only be reachable from
   the export. Decide first (for example, give that project a manuscript).
2. **Back up.** Settings → Export everything (the free plan has no backups).
3. **Migration:** `npx supabase db push`.
4. **App:** merge the branch into `master`; Vercel deploys it.

## Checks after deploying

- Settings → Profile has **PhD title**; fill it in. It shows in the sidebar ("Your PhD") and under
  the greeting on Home.
- Research has two tabs, **Publications** and **Benchwork**. SLR 1 and SLR 2 are under Review
  articles; SLR 2's 11 steps and PRISMA numbers are on its page.
- No "Project" anywhere: Quick Add, Journal filters, the entry page, Planner, Notes, Academics →
  milestones, the experiment page, the Timeline filters. Where it makes sense there's an optional
  **Publication** instead.
- An old `/research/projects/…` link opens the publication it became (or Research).
- Home → Working on lists publications in progress and Benchwork.
- ChatGPT connector: `list_projects` / `get_project` are gone; `get_manuscript` returns the review
  steps; `get_home_summary` returns `phd_title`.

## If something goes wrong

- **App problem, data fine:** redeploy the previous build — but the old app won't show the moved
  review steps. Better to fix forward.
- **Data looks wrong:** nothing was dropped. Each moved step, entry, task and note still has its
  old `project_id` until the cleanup migration, except review steps (cleared so a later purge can't
  take them); the dry-run output from step 1 says where each project's items went.
