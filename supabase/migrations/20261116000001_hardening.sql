-- Hardening after the production-readiness audit (docs/production-audit-2026-11-14.md).
--
--  1. Nobody erases rows with their own token: the app only ever soft-deletes (Trash),
--     so DELETE / TRUNCATE / TRIGGER / REFERENCES are taken away from signed-in users.
--     History stays append-only even for direct SQL: experiment revisions are written
--     only by the database, and a manuscript's current phase moves only through a
--     recorded phase change.
--  2. The nightly Trash purge can no longer be stopped by a task that waits on a purged
--     task, and it queues the stored files it orphans so they can be removed.
--  3. Stored files can only be removed when they are no longer evidence (failed or
--     abandoned uploads, purged records). A connected assistant's token only reaches
--     storage while its connection still exists.
--  4. Links that weren't limited to one owner now are.
--  5. "Today" for stored defaults is the person's own day, not the database's (UTC).
--  6. Submission status / decision history, and when she last downloaded an export.

-- ---------------------------------------------------------------- 1. no hard deletes

revoke delete, truncate, trigger, references on all tables in schema public from authenticated, anon;
alter default privileges for role postgres in schema public
  revoke delete, truncate, trigger, references on tables from authenticated, anon;

do $$
declare t text;
begin
  foreach t in array array['projects', 'entries', 'experiments', 'manuscripts', 'submissions', 'feedback',
                           'enquiries', 'events', 'blockers', 'courses', 'credit_recognitions',
                           'requirements', 'milestones', 'tasks', 'goals', 'attachments']
  loop
    execute format('drop policy if exists owner_delete on public.%I', t);
  end loop;
end $$;

-- Earlier experiment versions are written by the database only.
alter function app.keep_experiment_revision() security definer set search_path = '';
revoke insert on public.experiment_revisions from authenticated;

-- The current phase moves only through a recorded phase change (apply_phase_change).
alter function app.apply_phase_change() security definer set search_path = '';

create or replace function app.guard_current_phase() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- apply_phase_change runs as the function owner; a person's own update never does.
  if new.current_phase is distinct from old.current_phase
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'The phase changes only by recording a phase change'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger guard_current_phase before update of current_phase on public.manuscripts
  for each row execute function app.guard_current_phase();

-- ---------------------------------------------------------------- 2/3. stored files to remove

-- Paths of stored files that are no longer evidence. The app removes them from storage
-- (as the person, through the Storage API) and then forgets them here.
create table app.storage_removals (
  path text primary key,
  owner_id uuid not null,
  queued_at timestamptz not null default now()
);
alter table app.storage_removals enable row level security;
revoke all on app.storage_removals from public, anon, authenticated;
create index storage_removals_owner on app.storage_removals (owner_id, queued_at);

-- An upload that failed (wrong type, too big, abandoned) leaves nothing worth keeping.
create or replace function app.queue_failed_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'file' and new.status = 'failed' and new.storage_path is not null then
    insert into app.storage_removals (path, owner_id) values (new.storage_path, new.owner_id)
    on conflict (path) do nothing;
  end if;
  return new;
end $$;

create trigger queue_failed_upload after insert or update of status on public.attachments
  for each row execute function app.queue_failed_upload();

-- The signed-in person's queued paths (oldest first) …
create or replace function app.my_storage_removals(max_rows int default 100) returns setof text
language sql stable security definer set search_path = '' as $$
  select path from app.storage_removals where owner_id = auth.uid() order by queued_at limit greatest(1, least(max_rows, 500))
$$;

-- … and forgetting them once storage has removed them.
create or replace function app.forget_storage_removals(paths text[]) returns void
language sql security definer set search_path = '' as $$
  delete from app.storage_removals where owner_id = auth.uid() and path = any (paths)
$$;

-- May the signed-in person remove this stored object? Only when it isn't evidence:
-- it's queued for removal, or it belongs to an upload that never became verified.
create or replace function app.may_remove_object(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.storage_removals q where q.path = object_name and q.owner_id = auth.uid())
      or exists (select 1 from public.attachments a
                 where a.storage_path = object_name and a.owner_id = auth.uid() and a.status in ('pending', 'failed'))
$$;

-- A token without a connected app (the website) is fine; a connected assistant's token is
-- fine only while its connection still exists (Disconnect ends it at once, not in an hour).
create or replace function app.connector_ok() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id', '') = ''
      or app.connector_session_ok()
$$;

revoke all on function app.my_storage_removals(int), app.forget_storage_removals(text[]),
                       app.may_remove_object(text), app.connector_ok() from public, anon;
grant execute on function app.my_storage_removals(int), app.forget_storage_removals(text[]),
                          app.may_remove_object(text), app.connector_ok() to authenticated;

drop policy if exists evidence_read on storage.objects;
drop policy if exists evidence_write on storage.objects;
drop policy if exists evidence_delete on storage.objects;
create policy evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text and app.connector_ok());
create policy evidence_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text and app.connector_ok());
create policy evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text
         and app.connector_ok() and app.may_remove_object(name));

-- Goals can be moved to Trash and restored, like entries, tasks, projects and courses.
alter table public.goals add column if not exists deleted_at timestamptz;
create index if not exists goals_trash on public.goals (deleted_at) where deleted_at is not null;

-- The nightly purge, safe against tasks that wait on purged tasks, and queuing stored files.
create or replace function app.purge_trash(older_than interval default interval '30 days')
returns table (entries int, tasks int, projects int)
language plpgsql security definer set search_path = public, pg_temp as $$
-- (courses and goals in Trash are purged too; the counts cover entries, tasks and projects)
declare
  cutoff timestamptz := now() - older_than;
  n_entries int; n_tasks int; n_projects int;
begin
  -- uploads that never finished (tab closed mid-upload) are given up after a day
  update public.attachments set status = 'failed'
   where kind = 'file' and status = 'pending' and created_at < now() - interval '1 day';

  -- a task waiting on a purged task keeps waiting (its reason stays), just without the link
  update public.tasks set waiting_on_task_id = null
   where waiting_on_task_id in (select id from public.tasks where deleted_at < cutoff);
  delete from public.tasks where deleted_at < cutoff;
  get diagnostics n_tasks = row_count;

  -- keep tasks that came from a purged entry, just without the link
  update public.tasks set origin_entry_id = null
   where origin_entry_id in (select id from public.entries where deleted_at < cutoff);
  insert into app.storage_removals (path, owner_id)
    select storage_path, owner_id from public.attachments
     where parent_type = 'entry' and storage_path is not null
       and parent_id in (select id from public.entries where deleted_at < cutoff)
  on conflict (path) do nothing;
  update public.attachments set replaced_by_id = null
   where replaced_by_id in (select id from public.attachments where parent_type = 'entry'
                              and parent_id in (select id from public.entries where deleted_at < cutoff));
  delete from public.attachments where parent_type = 'entry'
     and parent_id in (select id from public.entries where deleted_at < cutoff);
  delete from public.entries where deleted_at < cutoff;
  get diagnostics n_entries = row_count;

  -- a purged project leaves its remaining records in place, unlinked
  update public.entries set project_id = null where project_id in (select id from public.projects where deleted_at < cutoff);
  update public.tasks set project_id = null where project_id in (select id from public.projects where deleted_at < cutoff);
  update public.manuscripts set project_id = null where project_id in (select id from public.projects where deleted_at < cutoff);
  update public.milestones set project_id = null where project_id in (select id from public.projects where deleted_at < cutoff);
  update public.blockers set project_id = null where project_id in (select id from public.projects where deleted_at < cutoff);
  insert into app.storage_removals (path, owner_id)
    select storage_path, owner_id from public.attachments
     where parent_type = 'project' and storage_path is not null
       and parent_id in (select id from public.projects where deleted_at < cutoff)
  on conflict (path) do nothing;
  update public.attachments set replaced_by_id = null
   where replaced_by_id in (select id from public.attachments where parent_type = 'project'
                              and parent_id in (select id from public.projects where deleted_at < cutoff));
  delete from public.attachments where parent_type = 'project'
     and parent_id in (select id from public.projects where deleted_at < cutoff);
  delete from public.projects where deleted_at < cutoff;
  get diagnostics n_projects = row_count;

  -- courses: tasks keep going without the link; credit records go with the course
  update public.tasks set course_id = null where course_id in (select id from public.courses where deleted_at < cutoff);
  insert into app.storage_removals (path, owner_id)
    select storage_path, owner_id from public.attachments
     where parent_type = 'course' and storage_path is not null
       and parent_id in (select id from public.courses where deleted_at < cutoff)
  on conflict (path) do nothing;
  update public.attachments set replaced_by_id = null
   where replaced_by_id in (select id from public.attachments where parent_type = 'course'
                              and parent_id in (select id from public.courses where deleted_at < cutoff));
  delete from public.attachments where parent_type = 'course'
     and parent_id in (select id from public.courses where deleted_at < cutoff);
  delete from public.courses where deleted_at < cutoff;

  delete from public.goals where deleted_at < cutoff;

  return query select n_entries, n_tasks, n_projects;
end $$;

revoke all on function app.purge_trash(interval) from public, anon, authenticated;

-- ---------------------------------------------------------------- 4. links within one owner

alter table public.manuscript_phase_events add constraint manuscript_phase_events_id_owner unique (id, owner_id);
alter table public.manuscript_phase_events drop constraint if exists manuscript_phase_events_corrects_event_id_fkey;
alter table public.manuscript_phase_events add constraint manuscript_phase_events_corrects_fkey
  foreign key (corrects_event_id, owner_id) references public.manuscript_phase_events (id, owner_id);

alter table public.attachments add constraint attachments_id_owner unique (id, owner_id);
alter table public.attachments drop constraint if exists attachments_replaced_by_id_fkey;
alter table public.attachments add constraint attachments_replaced_by_fkey
  foreign key (replaced_by_id, owner_id) references public.attachments (id, owner_id);

-- An attachment's parent must exist and belong to the same person.
create or replace function app.check_attachment_parent() returns trigger
language plpgsql set search_path = '' as $$
declare found boolean;
begin
  found := case new.parent_type
    when 'entry'      then exists (select 1 from public.entries     where id = new.parent_id and owner_id = new.owner_id)
    when 'project'    then exists (select 1 from public.projects    where id = new.parent_id and owner_id = new.owner_id)
    when 'manuscript' then exists (select 1 from public.manuscripts where id = new.parent_id and owner_id = new.owner_id)
    when 'course'     then exists (select 1 from public.courses     where id = new.parent_id and owner_id = new.owner_id)
    when 'milestone'  then exists (select 1 from public.milestones  where id = new.parent_id and owner_id = new.owner_id)
    else false
  end;
  if not found then
    raise exception 'That record wasn''t found' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger check_attachment_parent before insert or update of parent_type, parent_id, owner_id on public.attachments
  for each row execute function app.check_attachment_parent();

-- Two edits at once can't build a waiting loop: one person's task-link changes take turns.
create or replace function app.reject_task_cycle() returns trigger
language plpgsql as $$
begin
  if new.waiting_on_task_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('task-cycle:' || new.owner_id::text, 0));
    if exists (
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
  end if;
  return new;
end $$;

-- Indexes for links (joins, and keeping cascades / unlinking cheap as the data grows).
create index if not exists tasks_project on public.tasks (project_id) where project_id is not null;
create index if not exists tasks_origin_entry on public.tasks (origin_entry_id) where origin_entry_id is not null;
create index if not exists tasks_manuscript on public.tasks (manuscript_id) where manuscript_id is not null;
create index if not exists tasks_course on public.tasks (course_id) where course_id is not null;
create index if not exists tasks_waiting_on on public.tasks (waiting_on_task_id) where waiting_on_task_id is not null;
create index if not exists entries_project on public.entries (project_id) where project_id is not null;
create index if not exists manuscripts_project on public.manuscripts (project_id) where project_id is not null;
create index if not exists phase_events_manuscript on public.manuscript_phase_events (manuscript_id, recorded_at);
create index if not exists feedback_manuscript on public.feedback (manuscript_id) where manuscript_id is not null;
create index if not exists blockers_entry on public.blockers (entry_id) where entry_id is not null;
create index if not exists blockers_project on public.blockers (project_id) where project_id is not null;
create index if not exists milestones_project on public.milestones (project_id) where project_id is not null;
create index if not exists credit_recognitions_course on public.credit_recognitions (course_id);
create index if not exists attachments_replaced_by on public.attachments (replaced_by_id) where replaced_by_id is not null;
create index if not exists attachments_storage_path on public.attachments (storage_path) where storage_path is not null;

-- ---------------------------------------------------------------- 5. her "today"

-- Today's date in the signed-in person's own time zone (the database clock runs in UTC).
create or replace function app.user_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone coalesce(
            (select p.timezone from public.profiles p where p.user_id = auth.uid()),
            'Asia/Kolkata'))::date
$$;
grant execute on function app.user_today() to authenticated;

alter table public.blockers alter column opened_on set default app.user_today();

-- ---------------------------------------------------------------- 6. submission history, export date

alter table public.submissions add constraint submissions_id_owner unique (id, owner_id);

-- Append-only: every status or decision-date change of a submission, so a later update
-- never silently rewrites what was recorded before (revision rounds, decisions).
create table public.submission_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid not null,
  status text not null,
  decision_date date,
  -- the moment of the change itself, so changes within one save still keep their order
  recorded_at timestamptz not null default clock_timestamp(),
  created_via text not null default app.request_source(),
  foreign key (submission_id, owner_id) references public.submissions (id, owner_id) on delete cascade
);
create index submission_events_submission on public.submission_events (submission_id, recorded_at);

alter table public.submission_events enable row level security;
create policy owner_select on public.submission_events for select to authenticated using (app.can_read(owner_id));
revoke all on public.submission_events from anon;
revoke insert, update, delete, truncate, trigger, references on public.submission_events from authenticated;

create or replace function app.record_submission_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.decision_date is distinct from old.decision_date then
    insert into public.submission_events (owner_id, submission_id, status, decision_date)
    values (new.owner_id, new.id, new.status, new.decision_date);
  end if;
  return new;
end $$;

create trigger record_submission_event after insert or update of status, decision_date on public.submissions
  for each row execute function app.record_submission_event();

-- History starts with each submission's state as it is now.
insert into public.submission_events (owner_id, submission_id, status, decision_date, recorded_at, created_via)
select owner_id, id, status, decision_date, updated_at, created_via from public.submissions;

-- When she last downloaded "Export everything" (Home reminds her weekly; Free has no backups).
alter table public.profiles add column last_export_at timestamptz;

-- ---------------------------------------------------------------- connector labels

-- Label what an assistant adds by where its sign-in returns to, not by the name it gave
-- itself (anyone can register an app called "ChatGPT").
create or replace function app.connector_redirect() returns text
language sql stable security definer set search_path = '' as $$
  select c.redirect_uris
  from auth.oauth_clients c
  where c.id = nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id', '')::uuid
$$;
revoke all on function app.connector_redirect() from public, anon;
grant execute on function app.connector_redirect() to authenticated;

create or replace function app.request_source() returns text
language plpgsql stable as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  uris text;
  name text;
begin
  if claims is null or coalesce(claims ->> 'client_id', '') = '' then
    return 'app';
  end if;
  uris := lower(coalesce(app.connector_redirect(), ''));
  name := lower(coalesce(app.connector_client_name(), ''));
  -- every redirect must be on OpenAI's own sites
  if uris ~ '^(https://(chatgpt\.com|chat\.openai\.com|[a-z0-9-]+\.openai\.com)/[^,\s]*[,\s]*)+$' then
    return 'chatgpt';
  end if;
  -- Codex signs in through a local callback on her own computer
  if name like '%codex%' and uris ~ '^(http://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/[^,\s]*[,\s]*)+$' then
    return 'codex';
  end if;
  return 'mcp';
end $$;

-- Paths storage didn't report removing (already gone, e.g. an upload that never arrived)
-- are dropped from the queue after a week, so it never grows without bound.
create or replace function app.forget_stale_storage_removals() returns void
language sql security definer set search_path = '' as $$
  delete from app.storage_removals where owner_id = auth.uid() and queued_at < now() - interval '7 days'
$$;
revoke all on function app.forget_stale_storage_removals() from public, anon;
grant execute on function app.forget_stale_storage_removals() to authenticated;
