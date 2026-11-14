# Rolling out the scholar-feedback changes (November 2026)

What ships: Deepika's feedback from 14 Nov 2026 — Home reminders and calendar, task priority
High / Normal / Low and "keep reminding me", review steps with PRISMA numbers, Publications and
Benchwork views, course deadlines and admin info, Events, Notes, experiment trials, and the
connector tools for them. Plan and designs: the design canvas, section 6 (6.0 Plan, 6.9 Build plan).

Two migrations: `supabase/migrations/20261117000001_scholar_feedback.sql` (the new tables and
columns) and `20261117000002_scholar_feedback_fixes.sql` (fixes from the production review).

## Order — migration first, then the app, straight after

The migration changes the allowed task priorities from `normal / important` to
`high / normal / low` and moves every `important` task to `high`. Between the two steps the
**old app can't save a task as "Important"** (the database refuses it); everything else keeps
working. So run the two steps together, at a quiet time.

1. **Back up first.** Settings → Export everything (the free plan has no backups).
2. **Migration:** in this folder, `npx supabase db push` (the project is already linked; see
   `docs/hosting-plan-free.md`). It applies the two `20261117…` migrations, in order.
3. **App:** merge the branch into `master`; Vercel deploys it.

## Checks after deploying

- Home shows **Reminders**, the month calendar (red on overdue days), Recent updates, Your areas.
- Planner: open a task — Priority offers High / Normal / Low; old "Important" tasks show **High ↑**.
- Quick Add → Task → tick "Keep reminding me until it's done" → the banner shows on every page;
  Mark done removes it.
- A review project (SLR 1 / SLR 2): "Set up the 11 review steps", tick one, the bar moves.
- Research → Publications and Benchwork; Academics → a course's Deadlines and Admin info;
  Events; Notes (make a checklist, reload — it's saved).
- `/api/health` is OK, and `select jobname from cron.job` lists both `purge-trash` and
  `purge-notes-and-trials`.
- Settings → Export everything: the zip has `review_steps`, `course_items`, `notes`,
  `experiment_trials`.

## If something goes wrong

- **App problem, data fine:** redeploy the previous build in Vercel (Deployments → Promote). The
  old app works with the new database except for priority: it can't save "Important", and
  editing a High or Low task in the old Planner saves it as Normal. Roll forward rather than back
  if you can.
- **Undoing the migration** is only needed if the new tables themselves are the problem. Nothing
  else depends on them, so dropping them is safe; it loses only what was written to them:

  ```sql
  -- stored files of trials first, so the nightly storage clean-up removes them
  insert into app.storage_removals (path, owner_id)
    select storage_path, owner_id from public.attachments where parent_type = 'trial' and storage_path is not null
  on conflict (path) do nothing;
  update public.attachments set replaced_by_id = null
   where replaced_by_id in (select id from public.attachments where parent_type = 'trial');
  delete from public.attachments where parent_type = 'trial';
  select cron.unschedule('purge-notes-and-trials');
  drop function if exists app.purge_notes_and_trials(interval);
  drop table if exists public.review_steps, public.course_items, public.notes, public.experiment_trials;
  alter table public.profiles drop column if exists admin_details;
  alter table public.tasks drop column if exists remind_until_done;
  alter table public.tasks drop constraint tasks_priority_check;
  update public.tasks set priority = 'important' where priority = 'high';
  update public.tasks set priority = 'normal' where priority = 'low';
  alter table public.tasks add constraint tasks_priority_check check (priority in ('normal', 'important'));
  ```

  (The manuscript article-type check and the trial file type can stay; the old app ignores them.)

## Still to ask Deepika

Reminder by email or a snooze; which step records "records identified"; what "INDIA_IND → SL"
beside Screening means; what Admin info should hold; drawing in notes; what a "trial" is to her.
