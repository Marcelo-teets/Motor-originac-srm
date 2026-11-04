-- Exact-record monitoring. Not enabled by migration; requires feature flag,
-- per-user opt-in, delegated Microsoft OAuth and an authorized cron secret.
-- No mailbox/folder/canal-wide crawling and no raw message content.
create table if not exists public.dcm_source_watches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  provider text not null check (provider in (
    'outlook_email','outlook_calendar','teams','sharepoint'
  )),
  external_id text not null check (length(external_id) between 1 and 400),
  context_id text not null default '' check (length(context_id) <= 400),
  status text not null default 'active' check (status in ('active','paused')),
  last_fingerprint text check (last_fingerprint is null or last_fingerprint ~ '^[a-f0-9]{64}$'),
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,provider,external_id,context_id)
);
create index if not exists dcm_source_watches_owner on
  public.dcm_source_watches(owner_user_id,status,updated_at desc);
create index if not exists dcm_source_watches_due on
  public.dcm_source_watches(status,last_checked_at) where status='active';
alter table public.dcm_source_watches enable row level security;
comment on table public.dcm_source_watches is
  'Explicit per-user watchlist for individual Microsoft Graph IDs only. Privacy-minimized and disabled unless feature flag enabled.';
