create extension if not exists pgcrypto;

create table if not exists public.external_api_usage_monthly (
  provider text not null,
  month_key text not null,
  monthly_quota integer not null default 500,
  soft_target integer not null default 500,
  used_count integer not null default 0,
  last_reserved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, month_key),
  constraint external_api_monthly_quota_cap check (monthly_quota between 1 and 500),
  constraint external_api_monthly_target_cap check (soft_target between 1 and monthly_quota),
  constraint external_api_monthly_used_cap check (used_count between 0 and monthly_quota)
);

create table if not exists public.external_api_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  month_key text not null,
  source_code text,
  purpose text,
  allowed boolean not null,
  used_after integer not null,
  monthly_quota integer not null,
  remaining integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_api_usage_events_provider_month
  on public.external_api_usage_events(provider, month_key, created_at desc);
