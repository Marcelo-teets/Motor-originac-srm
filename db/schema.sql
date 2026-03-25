-- Canonical DDL for Motor Originação SRM
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text,
  role text not null default 'analyst',
  auth_provider text not null default 'supabase_auth',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists search_profiles (
  id text primary key,
  user_id uuid references users(id),
  name text not null,
  segment text,
  subsegment text,
  company_type text,
  geography text,
  credit_product text,
  target_structure text,
  minimum_signal_intensity integer default 50,
  minimum_confidence numeric(5,2) default 0.60,
  time_window_days integer default 90,
  status text not null default 'active',
  profile_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists search_profile_filters (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references search_profiles(id) on delete cascade,
  filter_key text not null,
  filter_value jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_search_profile_filters_profile on search_profile_filters(profile_id);

create table if not exists companies (
  id text primary key,
  legal_name text not null,
  trade_name text,
  cnpj text,
  segment text,
  subsegment text,
  geography text,
  company_type text,
  stage text,
  website text,
  current_funding_structure text,
  observed_payload jsonb default '{}'::jsonb,
  inferred_payload jsonb default '{}'::jsonb,
  estimated_payload jsonb default '{}'::jsonb,
  source_trace jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_companies_cnpj unique (cnpj)
);
create index if not exists idx_companies_segment on companies(segment);
create index if not exists idx_companies_stage on companies(stage);

create table if not exists source_catalog (
  id text primary key,
  name text not null unique,
  source_type text not null,
  category text not null,
  auth_requirement text,
  status text not null,
  metadata jsonb default '{}'::jsonb,
  rate_limit_notes text,
  health text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_sources (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  source_id text not null references source_catalog(id),
  external_id text,
  observed_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_company_source_reference unique (company_id, source_id, external_id)
);
create index if not exists idx_company_sources_company on company_sources(company_id);

create table if not exists monitoring_state (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  source_id text references source_catalog(id),
  last_run_at timestamptz,
  next_run_at timestamptz,
  status text not null default 'queued',
  observed_payload jsonb default '{}'::jsonb,
  inferred_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists monitoring_outputs (
  id text primary key,
  monitoring_state_id uuid references monitoring_state(id),
  company_id text references companies(id),
  source_id text references source_catalog(id),
  output_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2),
  connector_status text not null default 'partial',
  observed_vs_inferred text default 'observed',
  created_at timestamptz not null default now()
);
create index if not exists idx_monitoring_outputs_company on monitoring_outputs(company_id, created_at desc);

create table if not exists trigger_events (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  source_id text references source_catalog(id),
  trigger_type text not null,
  trigger_strength integer not null default 0,
  description text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_trigger_events_company on trigger_events(company_id, created_at desc);

create table if not exists company_signals (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  source_id text references source_catalog(id),
  signal_type text not null,
  signal_strength integer not null default 0,
  confidence_score numeric(5,2) not null default 0.50,
  evidence_payload jsonb default '{}'::jsonb,
  observed_vs_inferred text default 'observed',
  created_at timestamptz not null default now()
);
create index if not exists idx_company_signals_company on company_signals(company_id, created_at desc);

create table if not exists enrichments (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  enrichment_type text not null,
  provider text,
  payload jsonb not null,
  observed_vs_inferred text default 'inferred',
  created_at timestamptz not null default now()
);

create table if not exists score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  score_type text not null default 'qualification',
  score_value integer not null,
  rationale text,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists idx_score_snapshots_company_type on score_snapshots(company_id, score_type, created_at desc);

create table if not exists score_history (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  score_type text not null,
  previous_value integer,
  current_value integer,
  diff integer,
  changed_by text,
  created_at timestamptz not null default now()
);

create table if not exists lead_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  qualification_snapshot_id uuid,
  lead_score integer not null,
  bucket text not null,
  rationale text,
  next_action text,
  source_confidence numeric(5,2),
  trigger_strength integer,
  pattern_score integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_score_snapshots_company on lead_score_snapshots(company_id, created_at desc);

create table if not exists qualification_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  has_credit_product boolean,
  credit_product_type text,
  credit_is_core_product boolean,
  has_receivables boolean,
  receivables_type text[],
  receivables_recurrence_level text,
  receivables_predictability_level text,
  has_fidc boolean,
  has_securitization_structure boolean,
  has_existing_debt_structure boolean,
  funding_structure_type text,
  capital_structure_quality text,
  capital_structure_rationale text,
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
  qualification_score_structural integer,
  qualification_score_capital integer,
  qualification_score_receivables integer,
  qualification_score_execution integer,
  qualification_score_timing integer,
  qualification_score_total integer,
  confidence_score numeric(5,2),
  source_confidence_score numeric(5,2),
  trigger_strength_score integer,
  rationale_summary text,
  evidence_payload jsonb default '{}'::jsonb,
  pattern_summary jsonb not null default '[]'::jsonb,
  predicted_funding_need_score integer,
  urgency_score integer,
  suggested_structure_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_qualification_snapshots_company on qualification_snapshots(company_id, created_at desc);

create table if not exists thesis_outputs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  thesis_summary text not null,
  structure_type text,
  market_map_summary text,
  confidence_score numeric(5,2),
  created_at timestamptz not null default now()
);

create table if not exists market_map_cards (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  peer_name text not null,
  peer_type text,
  rationale text,
  created_at timestamptz not null default now()
);

create table if not exists ranking_v2 (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  position integer not null,
  qualification_score integer not null,
  lead_score integer not null,
  ranking_score integer not null default 0,
  rationale text,
  created_at timestamptz not null default now()
);

create table if not exists pipeline (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  stage text not null,
  owner_id uuid references users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  owner_id uuid references users(id),
  title text not null,
  activity_type text,
  status text not null default 'open',
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  owner_id uuid references users(id),
  title text not null,
  status text not null default 'todo',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_definitions (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null unique,
  objective text not null,
  inputs jsonb not null,
  outputs jsonb not null,
  dependencies jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  fallback_strategy text,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  execution_id text not null unique,
  agent_name text not null,
  company_id text references companies(id),
  source_id text references source_catalog(id),
  status text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  input_summary text,
  output_summary text,
  validation_result text,
  confidence_score numeric(5,2),
  quality_score numeric(5,2),
  error_details text,
  created_at timestamptz not null default now()
);

create table if not exists agent_run_steps (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  step_name text not null,
  status text not null,
  input_summary text,
  output_summary text,
  validation_result text,
  can_proceed boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists agent_outputs (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  artifact_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists validation_results (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid references agent_runs(id) on delete cascade,
  ran boolean not null default false,
  produced_output boolean not null default false,
  correct_format boolean not null default false,
  traceable boolean not null default false,
  minimum_confidence_met boolean not null default false,
  can_proceed boolean not null default false,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists learning_memory (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  learning_type text not null,
  memory_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists improvement_backlog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  priority text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pattern_catalog (
  id text primary key,
  pattern_name text not null unique,
  pattern_family text not null,
  description text not null,
  explicit_features jsonb not null default '[]'::jsonb,
  latent_features jsonb not null default '[]'::jsonb,
  default_qualification_impact integer not null default 0,
  default_lead_score_impact integer not null default 0,
  default_ranking_impact integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists company_patterns (
  id text primary key,
  company_id text not null references companies(id) on delete cascade,
  pattern_id text not null references pattern_catalog(id),
  rationale text,
  confidence_score numeric(5,2),
  qualification_impact integer,
  lead_score_impact integer,
  ranking_impact integer,
  thesis_impact text,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_company_patterns_company on company_patterns(company_id);

-- Institutional AI layer
create extension if not exists vector;

create table if not exists ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  company_id text references companies(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_sessions_company_created on ai_sessions(company_id, created_at desc);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ai_sessions(id) on delete cascade,
  role text not null check (role in ('system', 'assistant', 'analyst', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_messages_session_created on ai_messages(session_id, created_at desc);

create table if not exists ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references ai_sessions(id) on delete cascade,
  company_id text references companies(id),
  plugins jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_agent_runs_session_created on ai_agent_runs(session_id, created_at desc);

create table if not exists vector_documents (
  id uuid primary key,
  company_id text references companies(id),
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists idx_vector_documents_company on vector_documents(company_id);

create or replace function match_vector_documents(
  query_embedding vector(1536),
  match_count integer default 5
)
returns table(id uuid, content text)
language sql
as $$
  select vd.id, vd.content
  from vector_documents vd
  where vd.embedding is not null
  order by vd.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
