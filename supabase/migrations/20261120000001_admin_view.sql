-- Admins can look at a scholar's work, read-only, to help them.
--
-- How: inside one transaction the app (as the signed-in admin) calls app.admin_view_as(scholar),
-- which checks the caller is an admin on a website session, records the look in the activity
-- log, and then switches the transaction's identity to the scholar. The app makes the transaction
-- read-only straight after, so every "own rows only" rule applies as that scholar and nothing
-- can be added, changed or deleted. The rules on the tables themselves are unchanged.
--
-- Scholars are told: app.admin_views_of_me() lists who looked at their work and when, shown in
-- Settings.

alter table app.admin_events drop constraint admin_events_action_check;
alter table app.admin_events add constraint admin_events_action_check
  check (action in ('add', 'pause', 'resume', 'delete', 'view'));

-- Which account a look was about, so the scholar can be shown it. Emails stay as the record.
alter table app.admin_events add column target_id uuid references auth.users (id) on delete set null;
create index admin_events_views on app.admin_events (target_id, at desc) where action = 'view';

create function app.admin_view_as(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  claims jsonb := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  who uuid := auth.uid();
  target_email text;
begin
  if not app.is_admin() then
    raise exception 'Only admins can do this' using errcode = 'insufficient_privilege';
  end if;
  -- a ChatGPT / Codex connection never acts as an admin
  if claims ? 'client_id' then
    raise exception 'Only admins can do this' using errcode = 'insufficient_privilege';
  end if;
  select u.email::text into target_email from auth.users u where u.id = target and u.deleted_at is null;
  if target_email is null then
    raise exception 'That account no longer exists' using errcode = 'no_data_found';
  end if;
  -- one line in the log per admin and scholar every 30 minutes, not one per click
  if not exists (
    select 1 from app.admin_events e
    where e.actor_id = who and e.target_id = target and e.action = 'view' and e.at > now() - interval '30 minutes'
  ) then
    insert into app.admin_events (actor_id, actor_email, action, target_email, target_id)
    values (who, coalesce((select email from auth.users where id = who), ''), 'view', lower(target_email), target);
  end if;
  -- the rest of this transaction runs as the scholar
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', target, 'role', 'authenticated', 'email', target_email)::text, true);
end $$;

-- Who has looked at my work, and when. Anyone signed in, about themselves only.
create function app.admin_views_of_me(n int default 10)
returns table (at timestamptz, actor_email text)
language sql stable security definer set search_path = '' as $$
  select e.at, e.actor_email from app.admin_events e
  where e.target_id = auth.uid() and e.action = 'view'
  order by e.at desc, e.id desc limit least(greatest(n, 1), 50)
$$;

revoke all on function app.admin_view_as(uuid), app.admin_views_of_me(int) from public, anon;
grant execute on function app.admin_view_as(uuid), app.admin_views_of_me(int) to authenticated;
