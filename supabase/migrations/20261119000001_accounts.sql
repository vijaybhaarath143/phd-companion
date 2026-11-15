-- Accounts: a platform admin who creates and manages accounts, usernames for password
-- sign-in, suspension, and an append-only record of every admin action.
-- See docs/platform-admin-and-collaboration-plan.md (phase 1).
--
--  * Being platform admin gives NO access to anyone's research: every data table keeps
--    its owner-only policies. Admin functions read only account details.
--  * Every admin change goes through a security-definer function that checks the caller
--    is a platform admin in the database, and writes app.audit_log.
--  * Nobody can change their own username, status or admin role, or turn the
--    "choose a new password" flag back on for themselves.
--  * A suspended account is refused at once: by every app transaction (withUser checks
--    app.account_active) and by file storage (app.connector_ok), not only after its token expires.
--  * Failed password sign-ins are counted per account and per network address, because
--    Supabase only sees the app server's address for sign-ins made on the server.

-- ---------------------------------------------------------------- platform admins

create table app.platform_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'platform_admin' check (role in ('platform_admin')),
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now()
);
revoke all on app.platform_roles from public, anon, authenticated;

create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.platform_roles where user_id = auth.uid() and role = 'platform_admin')
$$;
revoke all on function app.is_platform_admin() from public, anon;
grant execute on function app.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------- audit log

create table app.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  subject_user_id uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_log_at on app.audit_log (at desc);
revoke all on app.audit_log from public, anon, authenticated;

create or replace function app.audit(p_action text, p_subject uuid, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into app.audit_log (actor_id, action, subject_user_id, details) values (auth.uid(), p_action, p_subject, p_details)
$$;
revoke all on function app.audit(text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- profile: account fields

alter table public.profiles
  add column username text unique
    check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  add column account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  add column must_change_password boolean not null default false,
  add column created_by uuid references auth.users (id) on delete set null;

-- Only admin functions (running as the table owner) change account fields. A person may
-- only clear their own "choose a new password" flag, after choosing one.
create or replace function app.guard_account_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.username is not null or new.account_status <> 'active' or new.must_change_password or new.created_by is not null then
      raise exception 'Account details are set by the admin' using errcode = 'insufficient_privilege';
    end if;
  elsif new.username is distinct from old.username
     or new.account_status is distinct from old.account_status
     or new.created_by is distinct from old.created_by
     or (new.must_change_password and not old.must_change_password) then
    raise exception 'Account details are set by the admin' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger guard_account_fields before insert or update on public.profiles
  for each row execute function app.guard_account_fields();

-- Is the signed-in account allowed in? It must still exist (a deleted account's token keeps
-- verifying until it expires) and not be suspended (no profile yet counts as active).
-- Checked at the start of every database transaction the app runs for a person.
create or replace function app.account_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid())
     and coalesce((select account_status = 'active' from public.profiles where user_id = auth.uid()), true)
$$;
revoke all on function app.account_active() from public, anon;
grant execute on function app.account_active() to authenticated;

-- ---------------------------------------------------------------- sign-in by username

-- Which email to sign in with for a username. Called by the app server with its own
-- database role before anyone is signed in; never callable from a browser token.
create or replace function app.login_email(p_username text) returns text
language sql stable security definer set search_path = '' as $$
  select u.email from public.profiles p join auth.users u on u.id = p.user_id
  where p.username = lower(btrim(p_username)) and p.account_status = 'active'
$$;
revoke all on function app.login_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- admin functions

create or replace function app.require_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Only the platform admin can do this' using errcode = 'insufficient_privilege';
  end if;
end $$;
revoke all on function app.require_platform_admin() from public, anon, authenticated;

-- Every account, with account details only (no research data).
create or replace function app.admin_list_users()
returns table (user_id uuid, email text, username text, display_name text, account_status text,
               must_change_password boolean, is_admin boolean, last_sign_in_at timestamptz,
               created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  return query
    select u.id, u.email::text, p.username, p.display_name, coalesce(p.account_status, 'active'),
           coalesce(p.must_change_password, false), r.user_id is not null, u.last_sign_in_at, u.created_at
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join app.platform_roles r on r.user_id = u.id
    order by coalesce(p.display_name, u.email), u.created_at;
end $$;

create or replace function app.admin_username_free(p_username text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  return not exists (select 1 from public.profiles where username = lower(btrim(p_username)));
end $$;

-- After the app creates the sign-in account: its profile, and admin role if asked.
create or replace function app.admin_create_profile(p_user uuid, p_username text, p_name text, p_make_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  insert into public.profiles (user_id, username, display_name, must_change_password, created_by)
  values (p_user, lower(btrim(p_username)), nullif(btrim(p_name), ''), true, auth.uid());
  if p_make_admin then
    insert into app.platform_roles (user_id, granted_by) values (p_user, auth.uid());
  end if;
  perform app.audit('user.created', p_user, jsonb_build_object('username', lower(btrim(p_username)), 'admin', p_make_admin));
end $$;

-- Give an existing account (e.g. one that signs in by email) a username.
create or replace function app.admin_set_username(p_user uuid, p_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text;
begin
  perform app.require_platform_admin();
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'No such account' using errcode = 'no_data_found';
  end if;
  select username into v_old from public.profiles where user_id = p_user;
  insert into public.profiles (user_id, username) values (p_user, lower(btrim(p_username)))
  on conflict (user_id) do update set username = excluded.username;
  perform app.audit('user.username_set', p_user, jsonb_build_object('from', v_old, 'to', lower(btrim(p_username))));
end $$;

-- After the app sets a temporary password: ask them to choose their own at next sign-in.
create or replace function app.admin_password_reset(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  insert into public.profiles (user_id, must_change_password) values (p_user, true)
  on conflict (user_id) do update set must_change_password = true;
  perform app.audit('user.password_reset', p_user);
end $$;

-- Suspend or reactivate. Suspending also ends the person's sessions on every device.
create or replace function app.admin_set_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  if p_status not in ('active', 'suspended') then
    raise exception 'Unknown status' using errcode = 'check_violation';
  end if;
  if p_user = auth.uid() and p_status = 'suspended' then
    raise exception 'You can''t suspend your own account' using errcode = 'check_violation';
  end if;
  insert into public.profiles (user_id, account_status) values (p_user, p_status)
  on conflict (user_id) do update set account_status = excluded.account_status;
  if p_status = 'suspended' then
    -- Ends refresh tokens too. Not required for safety (every request checks the status),
    -- so a project where this role may not write auth tables still suspends.
    begin
      delete from auth.sessions where user_id = p_user;
    exception when insufficient_privilege then
      raise notice 'sessions not removed: no permission on auth.sessions';
    end;
  end if;
  perform app.audit(case p_status when 'suspended' then 'user.suspended' else 'user.reactivated' end, p_user);
end $$;

create or replace function app.admin_set_platform_admin(p_user uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  if p_user = auth.uid() and not p_admin then
    raise exception 'You can''t remove your own admin role' using errcode = 'check_violation';
  end if;
  if p_admin then
    insert into app.platform_roles (user_id, granted_by) values (p_user, auth.uid()) on conflict do nothing;
  else
    delete from app.platform_roles where user_id = p_user;
  end if;
  perform app.audit(case when p_admin then 'admin.granted' else 'admin.removed' end, p_user);
end $$;

create or replace function app.admin_audit_log(p_limit int default 100)
returns table (id bigint, at timestamptz, action text, actor text, subject text, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  return query
    select l.id, l.at, l.action,
           coalesce(ap.display_name, ap.username, au.email::text,
                    case when l.actor_id is null and l.details ? 'via' then 'Setup script' else 'Someone' end),
           coalesce(sp.display_name, sp.username, su.email::text),
           l.details
    from app.audit_log l
    left join auth.users au on au.id = l.actor_id
    left join public.profiles ap on ap.user_id = l.actor_id
    left join auth.users su on su.id = l.subject_user_id
    left join public.profiles sp on sp.user_id = l.subject_user_id
    order by l.at desc, l.id desc
    limit least(greatest(p_limit, 1), 500);
end $$;

do $$
declare f text;
begin
  foreach f in array array['app.admin_list_users()', 'app.admin_username_free(text)',
                           'app.admin_create_profile(uuid, text, text, boolean)', 'app.admin_set_username(uuid, text)',
                           'app.admin_password_reset(uuid)', 'app.admin_set_status(uuid, text)',
                           'app.admin_set_platform_admin(uuid, boolean)', 'app.admin_audit_log(int)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- suspended: no file access

-- Stored files are reached with the person's own token, outside withUser, so the storage
-- policies (which all call connector_ok) also check the account is active.
create or replace function app.connector_ok() returns boolean
language sql stable set search_path = '' as $$
  select (coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id', '') = ''
          or app.connector_session_ok())
     and app.account_active()
$$;

-- ---------------------------------------------------------------- failed sign-ins

-- Keys are hashes made by the app ("account:<email>", "ip:<address>"), never the raw values.
create table app.sign_in_failures (
  key text not null,
  at timestamptz not null default now()
);
create index sign_in_failures_key on app.sign_in_failures (key, at);
create index sign_in_failures_at on app.sign_in_failures (at);
revoke all on app.sign_in_failures from public, anon, authenticated;

-- Too many recent failures for this account (10) or this address (30) in 15 minutes?
create or replace function app.sign_in_blocked(p_account text, p_ip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from app.sign_in_failures where key = p_account and at > now() - interval '15 minutes') >= 10
      or (p_ip is not null and
          (select count(*) from app.sign_in_failures where key = p_ip and at > now() - interval '15 minutes') >= 30)
$$;

create or replace function app.record_sign_in_failure(p_account text, p_ip text) returns void
language sql security definer set search_path = '' as $$
  delete from app.sign_in_failures where at < now() - interval '1 day';
  insert into app.sign_in_failures (key) select k from unnest(array[p_account, p_ip]) k where k is not null;
$$;

create or replace function app.clear_sign_in_failures(p_account text) returns void
language sql security definer set search_path = '' as $$
  delete from app.sign_in_failures where key = p_account;
$$;

-- Only the app server's own database role calls these, before anyone is signed in.
revoke all on function app.sign_in_blocked(text, text), app.record_sign_in_failure(text, text),
                       app.clear_sign_in_failures(text) from public, anon, authenticated;
