-- One PhD, no projects.
--
-- The PhD itself is the only project, so it gets a title on the profile. What used to be
-- "projects" move to where they belong:
--   * a review project (systematic or narrative), or any project with review steps, becomes a
--     publication: its review steps move onto that manuscript (one is created, in planning,
--     when the project had none), and entries, tasks and notes tagged with the project are
--     tagged with that publication instead; so do its files and links;
--   * a project with exactly one manuscript tags its items with that manuscript the same way;
--   * other projects (lab work and the like) just lose the tag: their experiments are already
--     under Benchwork.
-- Only projects outside Trash move. A project already in Trash is left as it is and is purged
-- when its 30 days are up, as before (its review steps go with it, as they always did).
-- Nothing else is deleted. The old project_id columns and the projects table stay, hidden from
-- the app, for one release so the move can be checked; a later migration drops them.

-- ---------------------------------------------------------------- 1. the PhD's title

alter table public.profiles add column phd_title text
  check (phd_title is null or (length(btrim(phd_title)) > 0 and length(phd_title) <= 300));

-- ---------------------------------------------------------------- 2. new links to publications

alter table public.review_steps add column manuscript_id uuid;
alter table public.review_steps alter column project_id drop not null;
alter table public.review_steps add constraint review_steps_manuscript_fkey
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id) on delete cascade;

alter table public.entries add column manuscript_id uuid;
alter table public.entries add constraint entries_manuscript_fkey
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id) on delete set null (manuscript_id);

-- tasks already have manuscript_id (feedback turned into tasks)

alter table public.notes add column manuscript_id uuid;
alter table public.notes add constraint notes_manuscript_fkey
  foreign key (manuscript_id, owner_id) references public.manuscripts (id, owner_id) on delete set null (manuscript_id);

-- ---------------------------------------------------------------- 3. move the data

-- Which publication each (active) project becomes. Projects not listed just lose the tag.
create temporary table project_publication (project_id uuid primary key, owner_id uuid not null, manuscript_id uuid);

insert into project_publication (project_id, owner_id, manuscript_id)
select p.id, p.owner_id,
       (select m.id from public.manuscripts m
         where m.project_id = p.id and m.owner_id = p.owner_id and m.deleted_at is null
         order by m.created_at, m.id limit 1)
  from public.projects p
 where p.deleted_at is null
   and (p.type in ('systematic_review', 'narrative_review')
        or exists (select 1 from public.review_steps r where r.project_id = p.id)
        or (select count(*) from public.manuscripts m where m.project_id = p.id and m.deleted_at is null) = 1);

-- A review project without a manuscript gets one, so its steps and notes have a home.
-- It carries the project's title and creation time and starts in planning.
with created as (
  insert into public.manuscripts (owner_id, project_id, title, article_type, created_at)
  select pr.owner_id, pr.id, pr.title, 'review', pr.created_at
    from project_publication pp join public.projects pr on pr.id = pp.project_id
   where pp.manuscript_id is null
  returning id, project_id
)
update project_publication pp set manuscript_id = c.id from created c where c.project_id = pp.project_id;

insert into public.manuscript_phase_events (owner_id, manuscript_id, phase, kind, effective_precision)
select m.owner_id, m.id, 'planning', 'change', 'none'
  from public.manuscripts m
 where m.id in (select manuscript_id from project_publication)
   and not exists (select 1 from public.manuscript_phase_events e where e.manuscript_id = m.id);

update public.manuscripts m set article_type = 'review'
  from project_publication pp join public.projects p on p.id = pp.project_id
 where m.id = pp.manuscript_id and m.article_type is null and p.type in ('systematic_review', 'narrative_review');

-- Steps move to the publication and stop belonging to the project, so they never go with it.
update public.review_steps r set manuscript_id = pp.manuscript_id, project_id = null
  from project_publication pp where r.project_id = pp.project_id;

update public.entries e set manuscript_id = pp.manuscript_id
  from project_publication pp where e.project_id = pp.project_id and e.manuscript_id is null;

update public.tasks t set manuscript_id = pp.manuscript_id
  from project_publication pp where t.project_id = pp.project_id and t.manuscript_id is null;

update public.notes n set manuscript_id = pp.manuscript_id
  from project_publication pp where n.project_id = pp.project_id and n.manuscript_id is null;

-- A project's files and links go with it to the publication.
update public.attachments a set parent_type = 'manuscript', parent_id = pp.manuscript_id
  from project_publication pp where a.parent_type = 'project' and a.parent_id = pp.project_id;

drop table project_publication;

-- Every step outside a trashed project now belongs to a publication.
alter table public.review_steps add constraint review_steps_has_parent check (manuscript_id is not null or project_id is not null);

-- ---------------------------------------------------------------- 4. indexes

drop index if exists public.review_steps_project_sort;
create unique index review_steps_manuscript_sort on public.review_steps (owner_id, manuscript_id, sort) where removed_at is null and manuscript_id is not null;
create index review_steps_manuscript on public.review_steps (manuscript_id, sort);
create index entries_manuscript on public.entries (manuscript_id) where manuscript_id is not null;
create index notes_manuscript on public.notes (manuscript_id) where manuscript_id is not null;
