-- Data Treatment & Enrichment Engine v2
-- Persists the auditable bridge between raw capture evidence and decision layers.

create table if not exists public.data_treatment_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  treatment_version text not null,
  trigger_type text not null,
  scope_type text not null,
  status text not null check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  outputs_seen integer not null default 0 check (outputs_seen >= 0),
  outputs_relevant integer not null default 0 check (outputs_relevant >= 0),
  outputs_decision_eligible integer not null default 0 check (outputs_decision_eligible >= 0),
  signals_generated integer not null default 0 check (signals_generated >= 0),
  enrichments_generated integer not null default 0 check (enrichments_generated >= 0),
  average_relevance_score numeric(6,2) not null default 0 check (average_relevance_score between 0 and 100),
  average_quality_score numeric(6,2) not null default 0 check (average_quality_score between 0 and 100),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.data_treatment_results (
  id uuid primary key default gen_random_uuid(),
  treatment_run_id uuid not null references public.data_treatment_runs(id) on delete cascade,
  monitoring_output_id uuid not null references public.monitoring_outputs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  treatment_version text not null,
  content_fingerprint text not null,
  relevance_score numeric(6,2) not null check (relevance_score between 0 and 100),
  quality_score numeric(6,2) not null check (quality_score between 0 and 100),
  confidence_score numeric(6,4) not null check (confidence_score between 0 and 1),
  evidence_level text not null check (evidence_level in ('observed', 'inferred')),
  signal_families text[] not null default '{}',
  suggested_structures text[] not null default '{}',
  normalized_facts jsonb not null default '{}'::jsonb,
  quality_issues jsonb not null default '[]'::jsonb,
  lineage jsonb not null default '{}'::jsonb,
  intrinsic_decision_eligible boolean not null default false,
  document_quality_status text not null default 'pending',
  decision_eligible boolean not null default false,
  decision_block_reason text,
  treatment_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (treatment_run_id, monitoring_output_id)
);

create index if not exists idx_data_treatment_runs_company_created
  on public.data_treatment_runs (company_id, created_at desc);

create index if not exists idx_data_treatment_runs_source_created
  on public.data_treatment_runs (source_id, created_at desc);

create index if not exists idx_data_treatment_results_fingerprint
  on public.data_treatment_results (content_fingerprint);

create index if not exists idx_data_treatment_results_company_created
  on public.data_treatment_results (company_id, created_at desc);

create index if not exists idx_data_treatment_results_source_created
  on public.data_treatment_results (source_id, created_at desc);

create index if not exists idx_data_treatment_results_decision_eligible
  on public.data_treatment_results (company_id, relevance_score desc, quality_score desc)
  where decision_eligible = true;

alter table public.data_treatment_runs enable row level security;
alter table public.data_treatment_results enable row level security;

revoke all on table public.data_treatment_runs from anon, authenticated;
revoke all on table public.data_treatment_results from anon, authenticated;
grant select, insert, update, delete on table public.data_treatment_runs to service_role;
grant select, insert, update, delete on table public.data_treatment_results to service_role;

comment on table public.data_treatment_runs is
  'Versioned audit history for each internal data treatment and enrichment pass after capture.';

comment on table public.data_treatment_results is
  'Per-evidence treatment result with lineage, intrinsic quality/relevance gate and final source-document decision eligibility.';
