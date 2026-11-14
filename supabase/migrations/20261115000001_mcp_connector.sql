-- Connector for ChatGPT / Codex (MCP). See docs/mcp.md.
--
-- Assistants sign in through Supabase Auth's OAuth 2.1 server, so their access tokens are
-- ordinary Supabase tokens for her account plus a `client_id` claim naming the connected app.
-- Row-level security applies unchanged. This migration adds:
--   * app.request_source(): 'app', or 'chatgpt' / 'codex' / 'mcp' when the request came
--     through a connected assistant — used as the default for created_via / changed_via;
--   * app.connector_session_ok(): is the assistant's sign-in still active (not disconnected)?
--   * created_via on more records, and changed_via (who last changed it) where assistants edit.

-- The connected app's name, for the client_id in this request's token (null for the app itself).
-- Reads Supabase Auth's client list, so it runs as the function owner; it only ever
-- returns the name of the client already named in the caller's own token.
create or replace function app.connector_client_name() returns text
language sql stable security definer set search_path = '' as $$
  select c.client_name
  from auth.oauth_clients c
  where c.id = nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id', '')::uuid
$$;

create or replace function app.request_source() returns text
language plpgsql stable as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  name text;
begin
  if claims is null or coalesce(claims ->> 'client_id', '') = '' then
    return 'app';
  end if;
  name := lower(coalesce(app.connector_client_name(), ''));
  if name like '%codex%' then return 'codex'; end if;
  if name like '%chatgpt%' or name like '%openai%' then return 'chatgpt'; end if;
  return 'mcp';
end $$;

-- True when the token's sign-in session still exists for this user and app. Disconnecting the
-- app (Settings → Connected apps) ends the session, so its remaining access token stops working
-- at once instead of lasting until it expires.
create or replace function app.connector_session_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s
    where s.id = nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and s.oauth_client_id = nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'client_id', '')::uuid
      and (s.not_after is null or s.not_after > now())
  )
$$;

revoke all on function app.connector_client_name() from public, anon;
revoke all on function app.connector_session_ok() from public, anon;
grant execute on function app.connector_client_name(), app.request_source(), app.connector_session_ok() to authenticated;

-- ---------------------------------------------------------------- where records came from

alter table public.projects alter column created_via set default app.request_source();
alter table public.entries alter column created_via set default app.request_source();
alter table public.tasks alter column created_via set default app.request_source();

alter table public.manuscripts add column created_via text not null default app.request_source();
alter table public.manuscript_phase_events add column created_via text not null default app.request_source();
alter table public.submissions add column created_via text not null default app.request_source();
alter table public.attachments add column created_via text not null default app.request_source();

-- Who made the latest change: 'app' or the assistant. Set on every update.
alter table public.entries add column changed_via text;
alter table public.tasks add column changed_via text;
alter table public.manuscripts add column changed_via text;
alter table public.feedback add column changed_via text;

create or replace function app.mark_changed_via() returns trigger
language plpgsql as $$
begin
  new.changed_via := app.request_source();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['entries', 'tasks', 'manuscripts', 'feedback']
  loop
    execute format('create trigger mark_changed_via before update on public.%I for each row execute function app.mark_changed_via()', t);
  end loop;
end $$;
