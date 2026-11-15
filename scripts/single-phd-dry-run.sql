-- Dry run for 20261118000001_single_phd.sql: what will happen to each project.
-- Read-only. Run it against the live database BEFORE the migration, e.g. in the Supabase SQL
-- editor, and check every row reads as expected.
--
--   becomes   publication it moves to: an existing manuscript, or "new publication (planning)"
--   steps / entries / tasks / notes / files   how many of each go with it
--   lab and other projects with no publication: their items only lose the tag

with p as (
  select pr.*,
         (select m.id from public.manuscripts m
           where m.project_id = pr.id and m.owner_id = pr.owner_id and m.deleted_at is null
           order by m.created_at, m.id limit 1) as first_manuscript,
         (select count(*) from public.manuscripts m where m.project_id = pr.id and m.deleted_at is null) as manuscripts,
         exists (select 1 from public.review_steps r where r.project_id = pr.id) as has_steps
    from public.projects pr
)
select p.title as project,
       coalesce(p.type, '—') as type,
       case
         when p.deleted_at is not null then 'in Trash: left as it is, purged when its 30 days are up'
         when not (coalesce(p.type in ('systematic_review', 'narrative_review'), false) or p.has_steps or p.manuscripts = 1)
           then 'no publication: items lose the tag'
         when p.first_manuscript is not null
           then 'publication: ' || (select title from public.manuscripts where id = p.first_manuscript)
         else 'new publication (planning): ' || p.title
       end as becomes,
       (select count(*) from public.review_steps r where r.project_id = p.id and r.removed_at is null) as steps,
       (select count(*) from public.entries e where e.project_id = p.id and e.deleted_at is null) as entries,
       (select count(*) from public.tasks t where t.project_id = p.id and t.deleted_at is null) as tasks,
       (select count(*) from public.notes n where n.project_id = p.id and n.deleted_at is null) as notes,
       (select count(*) from public.attachments a where a.parent_type = 'project' and a.parent_id = p.id and a.removed_at is null) as files,
       p.manuscripts as manuscripts_already
  from p
 order by p.owner_id, p.created_at;
