-- Neon UUID runtime core for Motor Originação.
-- Reconstructs the verified live identity contract (companies/source_catalog UUID)
-- without Supabase-managed auth/storage/cron objects. This is additive and empty-data safe.
-- Tested only on Neon temporary branches until complete_database_migration is explicitly approved.

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  role text not null default 'common',
  status text not null default 'active',
  auth_provider text not null default 'neon_auth',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key,
  email text not null unique,
  full_name text,
  role text not null default 'common',
  status text not null default 'active',
  job_title text,
  phone text,
  avatar_url text,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_identity_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  provider text not null,
  provider_user_id uuid,
  provider_email text,
  created_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trade_name text,
  cnpj text,
  domain text,
  normalized_domain text,
  description text,
  segment text,
  subsegment text,
  geography text not null default 'Brasil',
  company_type text,
  candidate_role text not null default 'operating_company',
  stage text,
  website text,
  current_funding_structure text,
  credit_product boolean,
  has_receivables boolean,
  has_fidc boolean,
  has_structured_debt boolean,
  funding_gap boolean,
  fit_fidc boolean,
  fit_dcm boolean,
  cnpj_valid boolean,
  confidence numeric(8,6),
  account_tier text,
  estimated_ticket_size numeric,
  commercial_owner_id uuid references public.users(id) on delete set null,
  commercial_owner_name text,
  next_step text,
  next_step_due_at timestamptz,
  priority_reason text,
  momentum_status text,
  observed_payload jsonb not null default '{}'::jsonb,
  inferred_payload jsonb not null default '{}'::jsonb,
  estimated_payload jsonb not null default '{}'::jsonb,
  source_trace jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_companies_cnpj_digits
  on public.companies ((regexp_replace(coalesce(cnpj,''),'\D','','g')))
  where nullif(regexp_replace(coalesce(cnpj,''),'\D','','g'),'') is not null;
create index if not exists idx_companies_segment on public.companies(segment);
create index if not exists idx_companies_stage on public.companies(stage);
create index if not exists idx_companies_domain on public.companies(normalized_domain);

create table if not exists public.source_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  category text,
  scope text,
  priority integer,
  criticality text,
  frequency text,
  status text not null default 'partial',
  validation_rule text,
  source_type text,
  auth_requirement text,
  metadata jsonb not null default '{}'::jsonb,
  rate_limit_notes text,
  health text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists source_catalog_metadata_code_uidx
  on public.source_catalog ((metadata->>'code'))
  where coalesce(metadata->>'code','') <> '';
create index if not exists idx_source_catalog_name on public.source_catalog(name);

create table if not exists public.search_profiles (
  id text primary key,
  name text not null,
  description text,
  target_segments text[] not null default '{}'::text[],
  target_keywords text[] not null default '{}'::text[],
  min_employee_count integer,
  geography text not null default 'Brasil',
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_profile_filters (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.search_profiles(id) on delete cascade,
  filter_key text not null,
  filter_value jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_search_profile_filters_profile on public.search_profile_filters(profile_id);

create table if not exists public.source_connector_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  scope_type text not null default 'global',
  trigger_type text not null default 'manual',
  status text not null default 'queued',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_collected integer not null default 0,
  outputs_written integer not null default 0,
  signals_written integer not null default 0,
  enrichments_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_source_connector_runs_company on public.source_connector_runs(company_id,started_at desc);
create index if not exists idx_source_connector_runs_source on public.source_connector_runs(source_id,started_at desc);

create table if not exists public.source_documents (
  id text primary key,
  run_id uuid references public.source_connector_runs(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  document_type text not null,
  external_id text,
  canonical_url text,
  title text,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  content_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'normalized',
  confidence_score numeric,
  captured_at timestamptz not null default now(),
  evidence_url text,
  payload_hash text
);
create index if not exists idx_source_documents_company on public.source_documents(company_id,observed_at desc);
create index if not exists idx_source_documents_source on public.source_documents(source_id,observed_at desc);

create table if not exists public.monitoring_outputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  run_id uuid references public.source_connector_runs(id) on delete set null,
  output_type text,
  title text,
  url text,
  raw_text text,
  summary text,
  observed_at timestamptz not null default now(),
  processed_at timestamptz,
  status text,
  source_confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  confidence_score numeric,
  connector_status text not null default 'partial',
  observed_vs_inferred text not null default 'observed',
  evidence_url text,
  source_document_id text references public.source_documents(id) on delete set null,
  captured_at timestamptz not null default now(),
  payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_monitoring_outputs_company on public.monitoring_outputs(company_id,observed_at desc);
create index if not exists idx_monitoring_outputs_source on public.monitoring_outputs(source_id,observed_at desc);

create table if not exists public.company_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  monitoring_output_id uuid references public.monitoring_outputs(id) on delete set null,
  signal_type text not null,
  signal_label text,
  evidence_url text,
  evidence_text text,
  observed_at timestamptz not null default now(),
  confidence numeric,
  strength numeric,
  metadata jsonb not null default '{}'::jsonb,
  signal_strength numeric,
  confidence_score numeric,
  evidence_payload jsonb not null default '{}'::jsonb,
  observed_vs_inferred text not null default 'observed',
  qualification_impact numeric,
  lead_score_impact numeric,
  ranking_impact numeric,
  thesis_impact text,
  captured_at timestamptz not null default now(),
  payload_hash text,
  source_document_id text references public.source_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_company_signals_company on public.company_signals(company_id,observed_at desc);
create index if not exists idx_company_signals_type on public.company_signals(signal_type,observed_at desc);

create table if not exists public.enrichments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  enrichment_type text not null,
  provider text,
  payload jsonb not null default '{}'::jsonb,
  observed_vs_inferred text not null default 'inferred',
  created_at timestamptz not null default now()
);
create index if not exists idx_enrichments_company_type on public.enrichments(company_id,enrichment_type,created_at desc);

create table if not exists public.qualification_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  has_credit_product boolean,
  credit_product_type text,
  credit_is_core boolean,
  credit_is_core_product boolean,
  has_receivables boolean,
  receivables_type text[] not null default '{}'::text[],
  receivables_recurrence_level text,
  receivables_predictability_level text,
  has_fidc boolean,
  has_securitization_structure boolean,
  has_existing_debt_structure boolean,
  uses_structured_debt boolean,
  funding_structure_type text,
  capital_structure_quality text,
  capital_structure_fit text,
  capital_structure_rationale text,
  funding_gap boolean,
  funding_gap_level text,
  capital_dependency_level text,
  growth_vs_funding_mismatch text,
  fit_fidc boolean,
  fit_dcm boolean,
  fit_other_structure text,
  governance_maturity_level text,
  risk_model_maturity_level text,
  underwriting_maturity_level text,
  operational_maturity_level text,
  unit_economics_quality text,
  spread_vs_funding_quality text,
  concentration_risk_level text,
  delinquency_signal_level text,
  timing_intensity_level text,
  execution_readiness_level text,
  structural_need_score numeric,
  timing_score numeric,
  executability_score numeric,
  qualification_score_structural numeric,
  qualification_score_capital numeric,
  qualification_score_receivables numeric,
  qualification_score_execution numeric,
  qualification_score_timing numeric,
  qualification_score_total numeric,
  confidence_score numeric,
  source_confidence_score numeric,
  trigger_strength_score numeric,
  rationale text,
  rationale_summary text,
  evidence jsonb not null default '[]'::jsonb,
  evidence_payload jsonb not null default '{}'::jsonb,
  pattern_summary jsonb not null default '[]'::jsonb,
  predicted_funding_need_score numeric,
  urgency_score numeric,
  suggested_structure_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qualification_snapshots_company on public.qualification_snapshots(company_id,created_at desc);

create table if not exists public.pattern_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  description text not null,
  default_weight numeric not null default 1,
  active boolean not null default true,
  pattern_name text,
  pattern_family text,
  explicit_features text[] not null default '{}'::text[],
  latent_features text[] not null default '{}'::text[],
  default_qualification_impact numeric not null default 0,
  default_lead_score_impact numeric not null default 0,
  default_ranking_impact numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_patterns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pattern_id uuid not null references public.pattern_catalog(id) on delete cascade,
  confidence numeric,
  rationale text,
  supporting_signal_ids uuid[] not null default '{}'::uuid[],
  detected_at timestamptz not null default now(),
  confidence_score numeric,
  qualification_impact numeric not null default 0,
  lead_score_impact numeric not null default 0,
  ranking_impact numeric not null default 0,
  thesis_impact text,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_company_patterns_company on public.company_patterns(company_id,detected_at desc);

create table if not exists public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score_type text not null default 'qualification',
  score_value numeric,
  total_score numeric,
  rationale text,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_score_snapshots_company on public.score_snapshots(company_id,score_type,created_at desc);

create table if not exists public.lead_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  qualification_snapshot_id uuid references public.qualification_snapshots(id) on delete set null,
  lead_score numeric not null,
  bucket text not null,
  rationale text,
  next_action text,
  source_confidence numeric,
  trigger_strength numeric,
  pattern_score numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_score_snapshots_company on public.lead_score_snapshots(company_id,created_at desc);

create table if not exists public.ranking_v2 (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  position integer not null,
  qualification_score integer not null,
  lead_score integer not null,
  ranking_score integer not null,
  rationale text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ranking_v2_company on public.ranking_v2(company_id,created_at desc);

create table if not exists public.pipeline (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stage text not null default 'Identified',
  owner_id uuid references public.users(id) on delete set null,
  owner text,
  notes text,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_pipeline_company on public.pipeline(company_id);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  owner_id uuid references public.users(id) on delete set null,
  owner text,
  title text not null,
  description text,
  activity_type text,
  type text,
  status text not null default 'open',
  due_at timestamptz,
  due_date timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  owner_id uuid references public.users(id) on delete set null,
  owner text,
  title text not null,
  description text,
  status text not null default 'todo',
  due_at timestamptz,
  due_date timestamptz,
  priority text,
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_profile_runs (
  id uuid primary key default gen_random_uuid(),
  search_profile_id text not null references public.search_profiles(id) on delete cascade,
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

create table if not exists public.discovered_company_candidates (
  id uuid primary key default gen_random_uuid(),
  search_profile_run_id uuid references public.search_profile_runs(id) on delete cascade,
  search_profile_id text references public.search_profiles(id) on delete cascade,
  company_name text not null,
  legal_name text,
  website text,
  normalized_domain text,
  cnpj text,
  cnpj_valid boolean,
  geography text default 'Brasil',
  segment text,
  subsegment text,
  company_type text,
  candidate_role text not null default 'operating_company',
  credit_product text,
  target_structure text,
  source_ref text,
  source_url text,
  evidence_summary text,
  receivables jsonb not null default '[]'::jsonb,
  confidence numeric(8,6) not null default 0.5,
  candidate_status text not null default 'captured',
  company_id uuid references public.companies(id) on delete set null,
  dedupe_key text,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_discovered_candidates_profile_status on public.discovered_company_candidates(search_profile_id,candidate_status,created_at desc);

create table if not exists public.company_discovery_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  discovered_candidate_id uuid not null references public.discovered_company_candidates(id) on delete cascade,
  match_method text not null default 'manual_promotion',
  confidence numeric(8,6) not null default 0.7,
  created_at timestamptz not null default now(),
  unique(company_id,discovered_candidate_id)
);

create table if not exists public.origination_reprocessing_queue (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  reasons jsonb not null default '[]'::jsonb,
  first_queued_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.data_treatment_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  connector_run_id uuid references public.source_connector_runs(id) on delete set null,
  status text not null default 'running',
  treatment_version text not null default 'v2',
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Data API is provisioned but deliberately default-deny until RLS/policies are migrated.
revoke all on schema public from anonymous, authenticated;
alter default privileges for role neondb_owner in schema public revoke all on tables from authenticated;
alter default privileges for role neondb_owner in schema public revoke all on sequences from authenticated;
alter default privileges for role neondb_owner in schema public revoke execute on functions from authenticated;
