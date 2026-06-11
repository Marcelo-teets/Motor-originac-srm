-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
alter table public.source_documents
  add column if not exists captured_at timestamptz,
  add column if not exists payload_hash text,
  add column if not exists evidence_url text,
  add column if not exists confidence numeric,
  add column if not exists quality_status text not null default 'pending';

update public.source_documents set
  captured_at = coalesce(captured_at, observed_at),
  payload_hash = coalesce(payload_hash, content_hash),
  evidence_url = coalesce(evidence_url, canonical_url),
  confidence = coalesce(confidence, confidence_score)
where captured_at is null or payload_hash is null or evidence_url is null or confidence is null;

create table if not exists public.search_profile_runs (
  id uuid primary key default gen_random_uuid(),
  search_profile_id uuid,
  run_status text,
  trigger_mode text,
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

create table if not exists public.discovered_company_candidates (
  id uuid primary key default gen_random_uuid(),
  search_profile_run_id uuid,
  search_profile_id uuid,
  company_name text,
  legal_name text,
  website text,
  normalized_domain text,
  cnpj text,
  geography text,
  segment text,
  subsegment text,
  company_type text,
  credit_product text,
  target_structure text,
  source_ref text,
  source_url text,
  evidence_summary text,
  receivables jsonb,
  confidence numeric,
  candidate_status text,
  company_id uuid,
  dedupe_key text,
  raw_payload jsonb,
  captured_at timestamptz,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spr_profile on public.search_profile_runs(search_profile_id, started_at desc);
create index if not exists idx_dcc_run on public.discovered_company_candidates(search_profile_run_id);
create index if not exists idx_dcc_dedupe on public.discovered_company_candidates(dedupe_key);

alter table public.search_profile_runs enable row level security;
alter table public.discovered_company_candidates enable row level security;
create policy srv_all_search_profile_runs on public.search_profile_runs as permissive for all to service_role using (true) with check (true);
create policy srv_all_discovered_company_candidates on public.discovered_company_candidates as permissive for all to service_role using (true) with check (true);
create policy authenticated_select_search_profile_runs on public.search_profile_runs as permissive for select to authenticated using (true);
create policy authenticated_select_discovered_company_candidates on public.discovered_company_candidates as permissive for select to authenticated using (true);
