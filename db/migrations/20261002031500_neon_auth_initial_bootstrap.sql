create schema if not exists private;

create table if not exists private.auth_bootstrap_claim (
  singleton boolean primary key default true check (singleton),
  claimed_at timestamptz not null default now(),
  claimed_email_hash text not null
);

revoke all on table private.auth_bootstrap_claim from public;
revoke all on table private.auth_bootstrap_claim from anon;
revoke all on table private.auth_bootstrap_claim from authenticated;

comment on table private.auth_bootstrap_claim is
  'One-way singleton claim that closes the first-user GOD-MODE bootstrap after the initial Neon Auth account is created.';
