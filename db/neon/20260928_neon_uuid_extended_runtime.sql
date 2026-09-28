-- Neon extended runtime modules for Motor Originação.
-- Additive only. Builds on 20260928_neon_uuid_runtime_core.sql.
-- Supabase-specific grants/policies are intentionally not copied; Neon Data API stays default-deny.

alter table public.companies
  add column if not exists last_touchpoint_at timestamptz,
  add column if not exists mapped_pains jsonb not null default '[]'::jsonb,
  add column if not exists competitors_context jsonb not null default '[]'::jsonb,
  add column if not exists entry_angle text,
  add column if not exists weekly_focus_flag boolean not null default false;

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.users(id) on delete set null,
  name text not null,
  description text,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_watchlists_created_by on public.watchlists(created_by,created_at desc);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  priority_label text,
  notes text,
  added_at timestamptz not null default now(),
  unique(watchlist_id,company_id)
);
create index if not exists idx_watchlist_items_company on public.watchlist_items(company_id);

create table if not exists public.account_stakeholders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  linkedin_url text,
  role_in_buying_committee text,
  seniority text,
  influence_score integer not null default 0,
  champion_score integer not null default 0,
  blocker_score integer not null default 0,
  relationship_strength integer not null default 0,
  what_they_care_about text,
  known_objections text,
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_account_stakeholders_company on public.account_stakeholders(company_id,updated_at desc);

create table if not exists public.touchpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stakeholder_id uuid references public.account_stakeholders(id) on delete set null,
  owner_id uuid references public.users(id) on delete set null,
  owner_name text,
  channel text not null,
  direction text,
  occurred_at timestamptz not null,
  summary text not null,
  raw_notes text,
  sentiment text,
  objection_raised boolean not null default false,
  agreed_next_step text,
  next_step_due_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_touchpoints_company_occurred on public.touchpoints(company_id,occurred_at desc);

create table if not exists public.objection_playbook (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  objection_label text not null,
  objection_text text not null,
  recommended_response text not null,
  credit_angle text,
  escalation_rule text,
  created_at timestamptz not null default now()
);

create table if not exists public.objection_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stakeholder_id uuid references public.account_stakeholders(id) on delete set null,
  touchpoint_id uuid references public.touchpoints(id) on delete set null,
  playbook_id uuid references public.objection_playbook(id) on delete set null,
  objection_text text not null,
  status text not null default 'open',
  severity text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_objection_instances_company_status on public.objection_instances(company_id,status,updated_at desc);

create table if not exists public.account_momentum_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  momentum_score integer not null,
  momentum_status text not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists idx_momentum_company_created on public.account_momentum_snapshots(company_id,created_at desc);

create table if not exists public.commercial_priority_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  priority_score integer not null,
  priority_band text not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists idx_priority_company_created on public.commercial_priority_snapshots(company_id,created_at desc);

create table if not exists public.deal_outcomes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  outcome_type text not null,
  reason text,
  decisive_objection text,
  learning_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.engine_requests (
  id uuid primary key default gen_random_uuid(),
  requester_engine text not null,
  target_engine text not null,
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  request_type text not null,
  priority text not null default 'medium',
  status text not null default 'queued',
  reason text,
  evidence_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_engine_requests_target_status on public.engine_requests(target_engine,status,created_at desc);

create table if not exists public.engine_learning_events (
  id uuid primary key default gen_random_uuid(),
  engine_name text not null,
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  event_type text not null,
  severity text not null default 'info',
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_engine_learning_events_engine on public.engine_learning_events(engine_name,created_at desc);

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
  primary key(provider,month_key),
  check(monthly_quota between 1 and 500),
  check(soft_target between 1 and monthly_quota),
  check(used_count between 0 and monthly_quota)
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

create table if not exists public.candidate_official_enrichments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.discovered_company_candidates(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  dataset_code text not null,
  source_record_key text not null,
  entity_cnpj text not null,
  enrichment_type text not null,
  effective_date date,
  source_url text not null,
  content_hash text not null,
  data jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id,dataset_code,source_record_key)
);
create index if not exists idx_candidate_official_enrichments_candidate on public.candidate_official_enrichments(candidate_id,observed_at desc);

create table if not exists public.public_dataset_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_id uuid references public.source_catalog(id) on delete set null,
  trigger_type text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  resources_discovered integer not null default 0,
  resources_processed integer not null default 0,
  resources_skipped integer not null default 0,
  rows_scanned bigint not null default 0,
  records_matched integer not null default 0,
  bronze_rows_written integer not null default 0,
  normalized_rows_written integer not null default 0,
  outputs_written integer not null default 0,
  signals_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status in ('running','completed','partial','failed'))
);
create unique index if not exists uq_public_dataset_single_running on public.public_dataset_runs(dataset_code) where status='running';

create table if not exists public.public_dataset_resource_checkpoints (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_id uuid references public.source_catalog(id) on delete set null,
  resource_key text not null,
  resource_name text not null,
  resource_url text not null,
  resource_modified_at text,
  etag text,
  content_hash text,
  status text not null,
  last_successful_run_at timestamptz,
  last_checked_at timestamptz not null default now(),
  rows_scanned bigint not null default 0,
  records_matched integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_code,resource_key)
);

create table if not exists public.public_company_records (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_code text not null,
  record_key text not null,
  company_id uuid references public.companies(id) on delete set null,
  entity_cnpj text not null,
  entity_name text,
  record_type text not null,
  reference_date date,
  amount numeric,
  status text,
  source_url text not null,
  resource_key text not null,
  content_hash text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_code,record_key)
);
create index if not exists idx_public_company_records_company on public.public_company_records(company_id,reference_date desc) where company_id is not null;

create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  investor_type text not null default 'unknown',
  website text,
  country_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_investor_relationships (
  id uuid primary key default gen_random_uuid(),
  relationship_key text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  relationship_type text not null default 'equity_investor',
  round_stage text,
  round_amount numeric,
  round_currency text,
  is_lead boolean not null default false,
  announced_at timestamptz,
  observed_at timestamptz not null default now(),
  source_url text,
  confidence_score numeric not null default 0.5,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_job_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.source_catalog(id) on delete cascade,
  external_job_id text not null,
  title text not null,
  normalized_title text not null,
  role_family text not null default 'other',
  seniority text not null default 'unspecified',
  location text,
  employment_type text,
  source_url text not null,
  opened_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open',
  dcm_relevance_score numeric not null default 0,
  credit_relevance_score numeric not null default 0,
  confidence_score numeric not null default 0.5,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,source_id,external_job_id)
);

create table if not exists public.company_credit_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  review_version integer not null,
  status text not null default 'draft',
  recommended_outcome text not null default 'pending',
  approved_outcome text,
  has_credit_product boolean,
  credit_is_core boolean,
  credit_product_type text,
  has_receivables boolean,
  receivables_structurable boolean,
  receivables_type text[] not null default '{}',
  receivables_recurrence_level text,
  receivables_predictability_level text,
  has_fidc boolean,
  uses_structured_debt boolean,
  funding_structure_type text,
  capital_structure_quality text,
  funding_gap_level text,
  fit_fidc boolean,
  fit_dcm boolean,
  timing_level text,
  suggested_structure text,
  structural_score numeric(6,2),
  capital_score numeric(6,2),
  receivables_score numeric(6,2),
  execution_score numeric(6,2),
  timing_score numeric(6,2),
  confidence numeric(5,4) not null default 0,
  rationale text,
  next_action text,
  evidence jsonb not null default '[]'::jsonb,
  review_payload jsonb not null default '{}'::jsonb,
  reviewer_user_id uuid,
  reviewer_email text,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,review_version)
);

-- Keep end-user Data API default-deny until explicit Neon Auth/RLS policies are reviewed.
revoke all privileges on all tables in schema public from anonymous, authenticated;
revoke all privileges on all sequences in schema public from anonymous, authenticated;
revoke all privileges on all functions in schema public from anonymous, authenticated;
