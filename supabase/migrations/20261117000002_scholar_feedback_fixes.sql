-- Fixes from the production review of the scholar-feedback changes (20261117000001).

-- A note linked to a project that is purged from Trash stays, just without the link.
-- (Without this, a linked note made the nightly purge of that project fail.)
alter table public.notes drop constraint notes_project_id_owner_id_fkey;
alter table public.notes add constraint notes_project_id_owner_id_fkey
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete set null (project_id);
create index notes_project on public.notes (project_id) where project_id is not null;

-- Assistants change review steps (update_review_step): record who made the latest change,
-- as on entries, tasks, manuscripts and feedback.
alter table public.review_steps add column changed_via text;
create trigger mark_changed_via before update on public.review_steps
  for each row execute function app.mark_changed_via();

-- One set of steps per review: two "Set up" clicks at once can't make two. (owner_id first, so
-- another account can never collide with — and so learn about — someone else's steps.)
create unique index review_steps_project_sort on public.review_steps (owner_id, project_id, sort) where removed_at is null;
