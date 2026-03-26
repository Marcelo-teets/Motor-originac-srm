-- Capture & Ingestion layer for Origination Intelligence Platform
-- Goal: persist discovery runs by search profile, candidate capture, normalization and company creation handoff.

create table if not exists search_profile_runs (
  id uuid primary key default gen_random_uuid(),
  search_profile_id text not null references search_profiles(id) on delete cascade,
  run_status text not null default 'queued',
  trigger_mode text not null default 'manual',
  source_count integer not null default 0,
  candidates_found integer not null default 0,
  candidates_inserted integer not null default 0,
  candidates_promoted integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_search_profile_runs_profile_created
  on search_profile_runs(search_profile_id, created_at desc);

create index if not exists idx_search_profile_runs_status
  on search_profile_runs(run_status, created_at desc);

create table if not exists discovered_company_candidates (
  id uuid primary key default gen_random_uuid(),
  search_profile_run_id uuid not null references search_profile_runs(id) on delete cascade,
  search_profile_id text not null references search_profiles(id) on delete cascade,
  company_name text not null,
  legal_name text,
  website text,
  normalized_domain text,
  cnpj text,
  geography text default 'Brasil',
  segment text,
  subsegment text,
  company_type text,
  credit_product text,
  target_structure text,
  source_ref text,
  source_url text,
  evidence_summary text,
  receivables jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null default 0.50,
  candidate_status text not null default 'captured',
  company_id text references companies(id) on delete set null,
  dedupe_key text,
  raw_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discovered_candidates_profile_status
  on discovered_company_candidates(search_profile_id, candidate_status, created_at desc);

create index if not exists idx_discovered_candidates_run
  on discovered_company_candidates(search_profile_run_id, created_at desc);

create index if not exists idx_discovered_candidates_company
  on discovered_company_candidates(company_id, created_at desc);

create unique index if not exists uq_discovered_candidates_dedupe
  on discovered_company_candidates(search_profile_id, dedupe_key)
  where dedupe_key is not null;

create table if not exists company_discovery_links (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  discovered_candidate_id uuid not null references discovered_company_candidates(id) on delete cascade,
  match_method text not null default 'manual_promotion',
  confidence numeric(5,4) not null default 0.70,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_company_discovery_links
  on company_discovery_links(company_id, discovered_candidate_id);

comment on table search_profile_runs is 'Execution log for discovery and capture runs triggered by search profiles.';
comment on table discovered_company_candidates is 'Captured candidates before promotion into canonical companies and monitoring.';
comment on table company_discovery_links is 'Traceability link between promoted companies and their discovery candidates.';
