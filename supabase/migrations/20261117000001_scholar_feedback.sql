-- Scholar feedback, November 2026 (design canvas section 6):
--  1. Task priority High / Normal / Low, and "keep reminding me until it's done".
--  2. Review milestones: the steps of a systematic review per project, with the counts a
--     PRISMA flow diagram is drawn from.
--  3. Manuscripts are review or original articles.
--  4. Course deadlines (assignments, exam registration, exam) and admin key details.
--  5. Notes: scratch pages and checklists, with Trash.
--  6. Experiment trials, each with its own files.
-- Same conventions as the core schema: an owner on every row, row-level security through
-- app.can_read / app.can_write, links within one owner only, no hard deletes by users.

-- ---------------------------------------------------------------- 1. tasks

alter table public.tasks drop constraint if exists tasks_priority_check;
-- a renamed value, not her edit: keep who last changed each task, and when
alter table public.tasks disable trigger mark_changed_via;
alter table public.tasks disable trigger touch;
update public.tasks set priority = 'high' where priority = 'important';
alter table public.tasks enable trigger touch;
alter table public.tasks enable trigger mark_changed_via;
alter table public.tasks add constraint tasks_priority_check check (priority in ('high', 'normal', 'low'));
alter table public.tasks add column remind_until_done boolean not null default false;
create index tasks_remind on public.tasks (owner_id) where remind_until_done and deleted_at is null;

-- ---------------------------------------------------------------- 2. review steps

create table public.review_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null,
  sort int not null,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done', 'skipped')),
  done_on date,
  -- which PRISMA number this step records, if any, and the number itself
  count_kind text check (count_kind in ('identified', 'duplicates_removed', 'screened', 'excluded_screening',
                                        'full_text_retrieved', 'excluded_eligibility', 'included')),
  count int check (count is null or count >= 0),
  note text check (note is null or length(note) <= 5000),
  removed_at timestamptz,
  created_via text not null default app.request_source(),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);
create index review_steps_project on public.review_steps (project_id, sort);

-- ---------------------------------------------------------------- 3. article type

alter table public.manuscripts disable trigger mark_changed_via;
alter table public.manuscripts disable trigger touch;
update public.manuscripts set article_type = null where article_type is not null and article_type not in ('review', 'original');
update public.manuscripts m set article_type = 'review'
  from public.projects p
 where p.id = m.project_id and m.article_type is null and p.type in ('systematic_review', 'narrative_review');
alter table public.manuscripts enable trigger touch;
alter table public.manuscripts enable trigger mark_changed_via;
alter table public.manuscripts add constraint manuscripts_article_type_check check (article_type is null or article_type in ('review', 'original'));

-- ---------------------------------------------------------------- 4. course deadlines, admin details

create table public.course_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  kind text not null check (kind in ('assignment', 'exam_registration', 'exam')),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  due_date date,
  done_at timestamptz,
  note text check (note is null or length(note) <= 2000),
  removed_at timestamptz,
  created_via text not null default app.request_source(),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, owner_id) references public.courses (id, owner_id) on delete cascade
);
create index course_items_course on public.course_items (course_id, due_date);
create index course_items_due on public.course_items (owner_id, due_date) where done_at is null and removed_at is null;

-- Things she keeps looking up (enrolment number, office contacts…): [{ "label": "…", "value": "…" }]
alter table public.profiles add column admin_details jsonb not null default '[]'::jsonb
  check (jsonb_typeof(admin_details) = 'array' and jsonb_array_length(admin_details) <= 50);

-- ---------------------------------------------------------------- 5. notes

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'scratch' check (kind in ('scratch', 'checklist')),
  title text not null default 'Untitled' check (length(title) <= 300),
  body text check (body is null or length(body) <= 100000),
  -- checklist items: [{ "id": "…", "text": "…", "done": true }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 500),
  project_id uuid,
  pinned boolean not null default false,
  created_via text not null default app.request_source(),
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '') || ' ' || items::text)
  ) stored,
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
);
create index notes_owner on public.notes (owner_id, pinned desc, updated_at desc) where deleted_at is null;
create index notes_search on public.notes using gin (search);

-- ---------------------------------------------------------------- 6. experiment trials

create table public.experiment_trials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid not null,
  trial_no int not null check (trial_no > 0),
  run_on date,
  conditions text check (conditions is null or length(conditions) <= 5000),
  result text check (result is null or length(result) <= 10000),
  outcome text check (outcome in ('worked', 'did_not_work', 'inconclusive')),
  removed_at timestamptz,
  created_via text not null default app.request_source(),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (entry_id, trial_no),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade
);

-- A trial's own files and links are evidence like any other.
alter table public.attachments drop constraint if exists attachments_parent_type_check;
alter table public.attachments add constraint attachments_parent_type_check
  check (parent_type in ('entry', 'project', 'manuscript', 'course', 'milestone', 'trial'));

create or replace function app.check_attachment_parent() returns trigger
language plpgsql set search_path = '' as $$
declare found boolean;
begin
  found := case new.parent_type
    when 'entry'      then exists (select 1 from public.entries           where id = new.parent_id and owner_id = new.owner_id)
    when 'project'    then exists (select 1 from public.projects          where id = new.parent_id and owner_id = new.owner_id)
    when 'manuscript' then exists (select 1 from public.manuscripts       where id = new.parent_id and owner_id = new.owner_id)
    when 'course'     then exists (select 1 from public.courses           where id = new.parent_id and owner_id = new.owner_id)
    when 'milestone'  then exists (select 1 from public.milestones        where id = new.parent_id and owner_id = new.owner_id)
    when 'trial'      then exists (select 1 from public.experiment_trials where id = new.parent_id and owner_id = new.owner_id)
    else false
  end;
  if not found then
    raise exception 'That record wasn''t found' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- triggers and security

do $$
declare t text;
begin
  foreach t in array array['review_steps', 'course_items', 'notes', 'experiment_trials']
  loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_select on public.%I for select to authenticated using (app.can_read(owner_id))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (app.can_write(owner_id))', t);
    execute format('create policy owner_update on public.%I for update to authenticated using (app.can_write(owner_id)) with check (app.can_write(owner_id))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke delete, truncate, trigger, references on public.%I from authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- nightly clean-up

-- Notes in Trash for more than 30 days go for good; so do the files of trials whose
-- experiment was purged (the trials themselves go with the experiment).
create or replace function app.purge_notes_and_trials(older_than interval default interval '30 days')
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.notes set project_id = null
   where project_id in (select id from public.projects where deleted_at < now() - older_than);
  delete from public.notes where deleted_at < now() - older_than;

  insert into app.storage_removals (path, owner_id)
    select a.storage_path, a.owner_id from public.attachments a
     where a.parent_type = 'trial' and a.storage_path is not null
       and not exists (select 1 from public.experiment_trials t where t.id = a.parent_id)
  on conflict (path) do nothing;
  update public.attachments set replaced_by_id = null
   where replaced_by_id in (select a.id from public.attachments a where a.parent_type = 'trial'
                              and not exists (select 1 from public.experiment_trials t where t.id = a.parent_id));
  delete from public.attachments a where a.parent_type = 'trial'
     and not exists (select 1 from public.experiment_trials t where t.id = a.parent_id);
end $$;

revoke all on function app.purge_notes_and_trials(interval) from public, anon, authenticated;
-- after the main purge (03:30), so the trials of experiments purged tonight are already gone
select cron.schedule('purge-notes-and-trials', '45 3 * * *', $$select app.purge_notes_and_trials()$$);
