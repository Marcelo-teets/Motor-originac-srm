create schema if not exists private;

create table if not exists private.auth_bootstrap_claim (
  singleton boolean primary key default true check (singleton),
  claimed_at timestamptz not null default now(),
  claimed_email_hash text not null
);

revoke all on table private.auth_bootstrap_claim from public;

do $
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table private.auth_bootstrap_claim from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table private.auth_bootstrap_claim from authenticated';
  end if;
end
$;

comment on table private.auth_bootstrap_claim is
  'One-way singleton claim that closes the first-user GOD-MODE bootstrap after the initial Neon Auth account is created.';
