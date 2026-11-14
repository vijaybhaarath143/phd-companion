-- Evidence files and the 30-day Trash.

-- Removing evidence hides it from the page but keeps the record and the stored file,
-- so earlier evidence is never silently lost (it stays in the export).
alter table public.attachments add column removed_at timestamptz;
alter table public.attachments add constraint attachment_size_limit check (size_bytes is null or size_bytes <= 20971520);
create index attachments_parent on public.attachments (owner_id, parent_type, parent_id);

-- Trash: items deleted more than 30 days ago are removed for good, once a night.
-- Runs as the table owner (not as a user) because it works across everyone's trash.
create or replace function app.purge_trash(older_than interval default interval '30 days')
returns table (entries int, tasks int, projects int)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cutoff timestamptz := now() - older_than;
  n_entries int; n_tasks int; n_projects int;
begin
  delete from public.tasks where deleted_at < cutoff;
  get diagnostics n_tasks = row_count;

  -- keep tasks that came from a purged entry, just without the link
  update public.tasks set origin_entry_id = null
   where origin_entry_id in (select id from public.entries where deleted_at < cutoff);
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
  delete from public.attachments where parent_type = 'project'
     and parent_id in (select id from public.projects where deleted_at < cutoff);
  delete from public.projects where deleted_at < cutoff;
  get diagnostics n_projects = row_count;

  return query select n_entries, n_tasks, n_projects;
end $$;

revoke all on function app.purge_trash(interval) from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('purge-trash', '30 3 * * *', $$select app.purge_trash()$$);
