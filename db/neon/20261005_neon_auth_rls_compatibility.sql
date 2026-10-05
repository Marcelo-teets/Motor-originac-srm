-- Neon compatibility bridge for legacy Supabase-style RLS/RPC identity checks.
-- Identity is injected transaction-locally by NeonPostgresClient.rpcAsUser after
-- the HTTP access token has been verified against Neon Auth.

begin;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anonymous') then
    create role anonymous nologin;
  end if;
end
$roles$;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$$;

create or replace function auth.role()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    auth.jwt()->>'role'
  )
$$;

revoke all on schema auth from public;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;
grant execute on function auth.role() to authenticated;

comment on function auth.uid() is
  'Neon Auth compatibility shim. Reads the transaction-local verified subject injected by the Motor backend.';
comment on function auth.jwt() is
  'Neon Auth compatibility shim. Reads transaction-local verified JWT claims injected by the Motor backend.';
comment on function auth.role() is
  'Neon Auth compatibility shim. Reads the transaction-local verified role injected by the Motor backend.';

commit;
