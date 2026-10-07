-- Durable Paperclip control plane on the existing engine_requests queue.
-- No parallel queue. ai_agent_runs remains the canonical execution audit.

alter table public.engine_requests
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists leased_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists actor text,
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists last_error text,
  add column if not exists completed_at timestamptz;

create unique index if not exists uq_engine_requests_target_idempotency
  on public.engine_requests(target_engine,idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_engine_requests_claimable
  on public.engine_requests(target_engine,status,available_at,created_at)
  where status in ('queued','failed');

comment on table public.engine_requests is
  'Canonical durable engine queue. Paperclip reuses this table with idempotency, lease, retry and actor/correlation audit fields.';
