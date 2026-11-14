-- PhD Companion — core schema
-- Conventions (see docs/technical-plan.md §6.1):
--  * every table has owner_id (defaults to the signed-in user) and RLS through app.can_read/app.can_write
--  * links between records use composite FKs (id, owner_id) so cross-user links are impossible
--  * partial dates are (date, precision); 'month' is stored as the 1st, 'none' has no date
--  * version column for optimistic concurrency; archived_at / deleted_at for archive and trash

create extension if not exists pg_trgm with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create type public.date_precision as enum ('day', 'month', 'none');

-- ---------------------------------------------------------------- helpers

create or replace function app.can_read(owner uuid) returns boolean
language sql stable as $$ select owner = auth.uid() $$;

create or replace function app.can_write(owner uuid) returns boolean
language sql stable as $$ select owner = auth.uid() $$;

create or replace function app.date_ok(d date, p public.date_precision) returns boolean
language sql immutable as $$
  select case p
    when 'none'  then d is null
    when 'day'   then d is not null
    when 'month' then d is not null and extract(day from d) = 1
  end
$$;

create or replace function app.date_from(d date, p public.date_precision) returns date
language sql immutable as $$ select case when p = 'none' then null else d end $$;

create or replace function app.date_to(d date, p public.date_precision) returns date
language sql immutable as $$
  select case p
    when 'day'   then d
    when 'month' then (d + interval '1 month' - interval '1 day')::date
    else null
  end
$$;

create or replace function app.touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profile

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text,
  university text,
  department text,
  guide_name text,
  programme_start date,
  programme_start_precision public.date_precision not null default 'none',
  timezone text not null default 'Asia/Kolkata',
  reminders_enabled boolean not null default true,
  onboarded_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programme_start_ok check (app.date_ok(programme_start, programme_start_precision))
);

-- ---------------------------------------------------------------- research

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  type text check (type in ('systematic_review', 'narrative_review', 'experimental', 'method_development',
                            'instrument_development', 'collaboration', 'other')),
  status text not null default 'in_progress'
    check (status in ('proposed', 'planning', 'in_progress', 'paused', 'completed')),
  objective text,
  description text,
  start_date date,
  start_precision public.date_precision not null default 'none',
  target_date date,
  target_precision public.date_precision not null default 'none',
  created_via text not null default 'app',
  archived_at timestamptz,
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint start_ok check (app.date_ok(start_date, start_precision)),
  constraint target_ok check (app.date_ok(target_date, target_precision))
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  kind text not null default 'note'
    check (kind in ('note', 'experiment', 'feedback', 'enquiry', 'event', 'meeting', 'decision')),
  category text check (category in ('research_writing', 'literature_review', 'experiment', 'guide_meeting',
                                    'coursework', 'conference', 'training', 'administrative', 'competition',
                                    'achievement', 'decision', 'reflection')),
  entry_date date,
  entry_precision public.date_precision not null default 'none',
  status text check (status in ('planned', 'done', 'postponed', 'cancelled')),
  description text,
  people text,
  outcome text,
  skills_learned text,
  project_id uuid,
  created_via text not null default 'app',
  archived_at timestamptz,
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  date_from date generated always as (app.date_from(entry_date, entry_precision)) stored,
  date_to date generated always as (app.date_to(entry_date, entry_precision)) stored,
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
                           coalesce(people, '') || ' ' || coalesce(outcome, ''))
  ) stored,
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id),
  constraint entry_date_ok check (app.date_ok(entry_date, entry_precision))
);
create index entries_owner_date on public.entries (owner_id, date_from desc nulls last, id);
create index entries_search on public.entries using gin (search);
create index entries_title_trgm on public.entries using gin (title extensions.gin_trgm_ops);

create table public.experiments (
  entry_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text check (status in ('planned', 'in_progress', 'completed', 'inconclusive', 'unsuccessful', 'paused')),
  objective text,
  materials text,
  procedure text,
  observations text,
  interpretation text,
  outcome text,
  next_steps text,
  last_edit_session uuid,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, owner_id),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade
);

-- Earlier versions are append-only (no update/delete policy).
create table public.experiment_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid not null,
  revision_no int not null,
  status text,
  objective text,
  materials text,
  procedure text,
  observations text,
  interpretation text,
  outcome text,
  next_steps text,
  captured_at timestamptz not null default now(),
  edit_session uuid,
  unique (entry_id, revision_no),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade
);

-- When an edit session that is new changes the recorded procedure/observations/etc,
-- keep the previous values as a read-only revision. Typing inside one session is grouped.
create or replace function app.keep_experiment_revision() returns trigger
language plpgsql as $$
begin
  if (old.objective, old.materials, old.procedure, old.observations, old.interpretation, old.outcome, old.next_steps)
       is distinct from
     (new.objective, new.materials, new.procedure, new.observations, new.interpretation, new.outcome, new.next_steps)
     and new.last_edit_session is distinct from old.last_edit_session
     and coalesce(old.objective, old.materials, old.procedure, old.observations, old.interpretation, old.outcome, old.next_steps) is not null
  then
    insert into public.experiment_revisions
      (owner_id, entry_id, revision_no, status, objective, materials, procedure, observations,
       interpretation, outcome, next_steps, captured_at, edit_session)
    values
      (old.owner_id, old.entry_id,
       coalesce((select max(revision_no) from public.experiment_revisions r where r.entry_id = old.entry_id), 0) + 1,
       old.status, old.objective, old.materials, old.procedure, old.observations,
       old.interpretation, old.outcome, old.next_steps, old.updated_at, old.last_edit_session);
  end if;
  return new;
end $$;

create table public.manuscripts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid,
  title text not null check (length(btrim(title)) > 0),
  article_type text,
  authors text,
  current_phase text not null default 'planning'
    check (current_phase in ('planning', 'research', 'writing', 'review', 'choosing_journal',
                             'under_review', 'revising', 'accepted', 'published', 'stopped')),
  stopped_reason text check (stopped_reason in ('withdrawn', 'abandoned')),
  doi text,
  publication_url text,
  archived_at timestamptz,
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
);

-- Append-only phase history. Only kind = 'change' moves the current phase.
create table public.manuscript_phase_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  manuscript_id uuid not null,
  phase text not null
    check (phase in ('planning', 'research', 'writing', 'review', 'choosing_journal',
                     'under_review', 'revising', 'accepted', 'published', 'stopped')),
  effective_date date,
  effective_precision public.date_precision not null default 'none',
  recorded_at timestamptz not null default now(),
  kind text not null check (kind in ('change', 'earlier_change', 'correction')),
  corrects_event_id uuid references public.manuscript_phase_events (id),
  note text,
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id) on delete cascade,
  constraint effective_ok check (app.date_ok(effective_date, effective_precision))
);

create or replace function app.apply_phase_change() returns trigger
language plpgsql as $$
begin
  if new.kind = 'change' then
    update public.manuscripts
       set current_phase = new.phase, version = version + 1
     where id = new.manuscript_id;
  end if;
  return new;
end $$;

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  manuscript_id uuid not null,
  attempt_no int not null,
  journal_name text not null check (length(btrim(journal_name)) > 0),
  manuscript_ref text,
  planned_date date,
  submitted_date date,
  submitted_precision public.date_precision not null default 'none',
  status text not null default 'submitted'
    check (status in ('planned', 'submitted', 'under_review', 'revise', 'rejected', 'accepted', 'withdrawn')),
  decision_date date,
  closed_at timestamptz,
  notes text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manuscript_id, attempt_no),
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id) on delete cascade,
  constraint submitted_ok check (app.date_ok(submitted_date, submitted_precision))
);

create table public.feedback (
  entry_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  manuscript_id uuid,
  source text,
  received_via text,
  requested_changes text,
  responsible_person text,
  deadline date,
  deadline_precision public.date_precision not null default 'none',
  resolution_status text not null default 'open' check (resolution_status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolution_note text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade,
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id),
  constraint deadline_ok check (app.date_ok(deadline, deadline_precision))
);

create table public.enquiries (
  entry_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  office text,
  contact text,
  response text,
  follow_up_date date,
  status text not null default 'open' check (status in ('open', 'waiting', 'closed')),
  closed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade
);

create table public.events (
  entry_id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  organiser text,
  location text,
  registration text check (registration in ('interested', 'registered', 'not_registered')),
  participation text not null default 'unknown'
    check (participation in ('unknown', 'attended', 'presented', 'did_not_attend', 'cancelled')),
  presentation_title text,
  award text,
  submission_outcome text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade
);

create table public.blockers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid,
  project_id uuid,
  category text not null default 'other'
    check (category in ('equipment', 'procurement', 'protocol', 'sample_preparation', 'inconsistency', 'other')),
  description text not null,
  opened_on date not null default current_date,
  resolved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, owner_id) references public.entries (id, owner_id) on delete cascade,
  foreign key (project_id, owner_id) references public.projects (id, owner_id)
);

-- ---------------------------------------------------------------- academics

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  provider text,
  credits numeric(5, 2) check (credits is null or credits >= 0),   -- null = not recorded, never zero
  status text not null default 'enrolled' check (status in ('planned', 'enrolled', 'completed', 'dropped')),
  completed_on date,
  archived_at timestamptz,
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.credit_recognitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid not null,
  amount numeric(5, 2) not null check (amount > 0),
  recognised_on date,
  recognised_precision public.date_precision not null default 'none',
  reference text,
  created_at timestamptz not null default now(),
  foreign key (course_id, owner_id) references public.courses (id, owner_id) on delete cascade,
  constraint recognised_ok check (app.date_ok(recognised_on, recognised_precision))
);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  period_label text,
  required_credits numeric(5, 2),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  project_id uuid,
  target_date date,
  target_precision public.date_precision not null default 'none',
  status text not null default 'not_started' check (status in ('not_started', 'done', 'skipped')),
  done_on date,
  done_precision public.date_precision not null default 'none',
  sort int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects (id, owner_id),
  constraint target_ok check (app.date_ok(target_date, target_precision)),
  constraint done_ok check (app.date_ok(done_on, done_precision))
);

-- ---------------------------------------------------------------- planning

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  status text not null default 'todo' check (status in ('todo', 'doing', 'waiting', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('normal', 'important')),
  due_date date,
  notes text,
  project_id uuid,
  origin_entry_id uuid,
  manuscript_id uuid,
  course_id uuid,
  waiting_reason text,
  waiting_on_task_id uuid,
  completed_at timestamptz,
  created_via text not null default 'app',
  archived_at timestamptz,
  deleted_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id),
  foreign key (origin_entry_id, owner_id) references public.entries (id, owner_id),
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id),
  foreign key (course_id, owner_id) references public.courses (id, owner_id),
  foreign key (waiting_on_task_id, owner_id) references public.tasks (id, owner_id),
  constraint not_self_waiting check (waiting_on_task_id is distinct from id)
);
create index tasks_owner_status on public.tasks (owner_id, status, due_date);

create or replace function app.reject_task_cycle() returns trigger
language plpgsql as $$
begin
  if new.waiting_on_task_id is not null and exists (
    with recursive chain(id) as (
      select new.waiting_on_task_id
      union
      select t.waiting_on_task_id from public.tasks t join chain c on t.id = c.id
      where t.waiting_on_task_id is not null
    )
    select 1 from chain where id = new.id
  ) then
    raise exception 'A task cannot wait on itself, directly or through other tasks'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  horizon text not null check (horizon in ('week', 'month', 'semester', 'year')),
  period_start date,
  period_end date,
  outcome text not null default 'open' check (outcome in ('open', 'achieved', 'dropped')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- evidence

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_type text not null check (parent_type in ('entry', 'project', 'manuscript', 'course', 'milestone')),
  parent_id uuid not null,
  kind text not null check (kind in ('file', 'link')),
  url text,
  storage_path text,
  filename text,
  label text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  status text not null default 'verified' check (status in ('pending', 'verified', 'failed')),
  replaced_by_id uuid references public.attachments (id),
  created_at timestamptz not null default now(),
  constraint link_or_file check ((kind = 'link' and url is not null) or (kind = 'file' and storage_path is not null))
);

-- ---------------------------------------------------------------- triggers

do $$
declare t text;
begin
  foreach t in array array['profiles', 'projects', 'entries', 'experiments', 'manuscripts', 'submissions',
                           'feedback', 'enquiries', 'events', 'blockers', 'courses', 'requirements',
                           'milestones', 'tasks', 'goals']
  loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch()', t);
  end loop;
end $$;

create trigger keep_revision before update on public.experiments
  for each row execute function app.keep_experiment_revision();
create trigger apply_phase after insert on public.manuscript_phase_events
  for each row execute function app.apply_phase_change();
create trigger no_task_cycle before insert or update of waiting_on_task_id on public.tasks
  for each row execute function app.reject_task_cycle();

-- ---------------------------------------------------------------- row-level security

do $$
declare t text;
begin
  -- full read/write for the owner
  foreach t in array array['projects', 'entries', 'experiments', 'manuscripts', 'submissions', 'feedback',
                           'enquiries', 'events', 'blockers', 'courses', 'credit_recognitions',
                           'requirements', 'milestones', 'tasks', 'goals', 'attachments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_select on public.%I for select to authenticated using (app.can_read(owner_id))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (app.can_write(owner_id))', t);
    execute format('create policy owner_update on public.%I for update to authenticated using (app.can_write(owner_id)) with check (app.can_write(owner_id))', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (app.can_write(owner_id))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;

  -- history tables: read and append only
  foreach t in array array['experiment_revisions', 'manuscript_phase_events']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy owner_select on public.%I for select to authenticated using (app.can_read(owner_id))', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (app.can_write(owner_id))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke update, delete on public.%I from authenticated', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy own_profile_select on public.profiles for select to authenticated using (app.can_read(user_id));
create policy own_profile_insert on public.profiles for insert to authenticated with check (app.can_write(user_id));
create policy own_profile_update on public.profiles for update to authenticated
  using (app.can_write(user_id)) with check (app.can_write(user_id));
revoke all on public.profiles from anon;

-- ---------------------------------------------------------------- private file storage

insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 20971520)
on conflict (id) do nothing;

create policy evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy evidence_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
