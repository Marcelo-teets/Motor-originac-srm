create table if not exists public.enrichments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  enrichment_type text not null,
  provider text,
  payload jsonb not null default '{}'::jsonb,
  observed_vs_inferred text not null default 'inferred',
  created_at timestamptz not null default now()
);

create index if not exists idx_enrichments_company_type
  on public.enrichments(company_id, enrichment_type, created_at desc);

create index if not exists idx_enrichments_capture_treatment_profile
  on public.enrichments(company_id, created_at desc)
  where enrichment_type = 'capture_treatment_profile';

create index if not exists idx_monitoring_outputs_treatment_relevance
  on public.monitoring_outputs(company_id, observed_at desc)
  where (payload->'treatment'->>'relevanceScore') is not null;

create index if not exists idx_company_signals_signal_type_observed
  on public.company_signals(signal_type, observed_at desc);
