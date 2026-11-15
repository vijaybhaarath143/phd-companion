-- Admins: people who can add, pause and remove scholars from the Admin page.
--
-- Who is an admin is kept in its own table in the private `app` schema, not on the profile:
-- everyone can edit their own profile, so a flag there could be switched on by anyone.
-- Nobody can make themselves an admin from the app; it is granted by SQL only:
--
--   insert into app.admins (user_id) select id from auth.users where email = 'you@example.com';
--
-- Being an admin never opens anyone's records: the "own rows only" rules are unchanged.
-- Admins see account details (email, name, joined, last sign-in) through admin_scholars().

create table app.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now()
);

-- What admins did, and to whom. Kept when either account is deleted (emails are copied).
create table app.admin_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text not null,
  action text not null check (action in ('add', 'pause', 'resume', 'delete')),
  target_email text not null check (length(target_email) between 3 and 254)
);
create index admin_events_at on app.admin_events (at desc);

revoke all on app.admins, app.admin_events from public, anon, authenticated;

-- Is the signed-in person an admin? Asked by the app on every admin page and action.
create function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.admins where user_id = auth.uid())
$$;

-- Every account, for the Admin page. Admins only.
create function app.admin_scholars()
returns table (
  id uuid, email text, display_name text, created_at timestamptz, last_sign_in_at timestamptz,
  banned_until timestamptz, onboarded boolean, is_admin boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Only admins can see this' using errcode = 'insufficient_privilege';
  end if;
  return query
    select u.id, u.email::text, p.display_name, u.created_at, u.last_sign_in_at, u.banned_until,
           p.onboarded_at is not null, exists (select 1 from app.admins a where a.user_id = u.id)
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where u.deleted_at is null
    order by u.created_at desc;
end $$;

-- The latest admin activity. Admins only.
create function app.admin_log(n int default 50)
returns table (at timestamptz, actor_email text, action text, target_email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Only admins can see this' using errcode = 'insufficient_privilege';
  end if;
  return query
    select e.at, e.actor_email, e.action, e.target_email from app.admin_events e
    order by e.at desc, e.id desc limit least(greatest(n, 1), 200);
end $$;

-- Record one admin action, as the admin who did it. Admins only.
create function app.record_admin_event(what text, target text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'Only admins can do this' using errcode = 'insufficient_privilege';
  end if;
  insert into app.admin_events (actor_id, actor_email, action, target_email)
  values (auth.uid(), coalesce((select email from auth.users where id = auth.uid()), ''), what, lower(target));
end $$;

revoke all on function app.is_admin(), app.admin_scholars(), app.admin_log(int), app.record_admin_event(text, text)
  from public, anon;
grant execute on function app.is_admin(), app.admin_scholars(), app.admin_log(int), app.record_admin_event(text, text)
  to authenticated;
