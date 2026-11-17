-- Native model connection; distinct from the inbound MCP connector.
-- app is NOT an exposed PostgREST schema. Only encrypted envelopes are persisted.
-- Tokens and transaction verifiers must never be added to public tables or exports.
create table app.chatgpt_connections (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1,
  client_id text,
  subject text,
  email text,
  credentials text,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'reconnect_required')),
  checked_at timestamptz,
  refresh_lease uuid,
  refresh_started_at timestamptz,
  check_lease uuid,
  check_started_at timestamptz,
  updated_at timestamptz not null default now()
);
create table app.chatgpt_transactions (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null,
  browser_hash text not null,
  payload text not null,
  connection_version integer not null,
  expires_at timestamptz not null
);

-- No assistant bearer token can read, modify or borrow the model connection.
-- Grant only encrypted data under the existing withUser identity boundary.
revoke all on app.chatgpt_connections, app.chatgpt_transactions from public, anon, authenticated;
grant select, insert, update, delete on app.chatgpt_connections, app.chatgpt_transactions to authenticated;
alter table app.chatgpt_connections enable row level security;
alter table app.chatgpt_transactions enable row level security;
create policy browser_owner on app.chatgpt_connections to authenticated
  using (owner_id = auth.uid() and coalesce(auth.jwt()->>'client_id', '') = '')
  with check (owner_id = auth.uid() and coalesce(auth.jwt()->>'client_id', '') = '');
create policy browser_owner on app.chatgpt_transactions to authenticated
  using (owner_id = auth.uid() and coalesce(auth.jwt()->>'client_id', '') = '')
  with check (owner_id = auth.uid() and coalesce(auth.jwt()->>'client_id', '') = '');
