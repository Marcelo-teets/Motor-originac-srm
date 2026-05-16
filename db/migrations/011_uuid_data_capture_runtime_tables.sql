create table if not exists public.source_connector_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id),
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
create index if not exists idx_source_connector_runs_company on public.source_connector_runs(company_id, started_at desc);
create index if not exists idx_source_connector_runs_source on public.source_connector_runs(source_id, started_at desc);

create table if not exists public.source_documents (
  id text primary key,
  run_id uuid references public.source_connector_runs(id) on delete set null,
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id),
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
  confidence_score numeric
);
create index if not exists idx_source_documents_company on public.source_documents(company_id, observed_at desc);
create index if not exists idx_source_documents_source on public.source_documents(source_id, observed_at desc);
create unique index if not exists uq_source_documents_fingerprint on public.source_documents(company_id, source_id, content_hash);

create table if not exists public.company_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alias_type text not null,
  alias_value text not null,
  source_id uuid references public.source_catalog(id),
  confidence_score numeric(5,2) not null default 0.75,
  created_at timestamptz not null default now(),
  unique(company_id, alias_type, alias_value)
);
create index if not exists idx_company_entity_aliases_company on public.company_entity_aliases(company_id, created_at desc);

create table if not exists public.engine_requests (
  id uuid primary key default gen_random_uuid(),
  requester_engine text not null,
  target_engine text not null,
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id),
  request_type text not null,
  priority text not null default 'medium',
  status text not null default 'queued',
  reason text,
  evidence_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_engine_requests_target_status on public.engine_requests(target_engine, status, created_at desc);
create index if not exists idx_engine_requests_company on public.engine_requests(company_id, created_at desc);

create table if not exists public.engine_learning_events (
  id uuid primary key default gen_random_uuid(),
  engine_name text not null,
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id),
  event_type text not null,
  severity text not null default 'info',
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_engine_learning_events_engine on public.engine_learning_events(engine_name, created_at desc);

create table if not exists public.code_improvement_proposals (
  id uuid primary key default gen_random_uuid(),
  engine_name text not null,
  proposal_type text not null,
  title text not null,
  rationale text,
  target_module text,
  status text not null default 'draft',
  risk_level text not null default 'medium',
  proposal_payload jsonb not null default '{}'::jsonb,
  test_plan jsonb not null default '[]'::jsonb,
  branch_name text,
  pr_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_code_improvement_proposals_engine on public.code_improvement_proposals(engine_name, created_at desc);

update public.source_catalog
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('code', case
  when lower(name) like '%company websites%' then 'src_company_website'
  when lower(name) like '%receita%' or lower(name) like '%cnpj%' then 'src_brasilapi_cnpj'
  when lower(name) like '%cvm%' then 'src_cvm_rss'
  when lower(name) like '%pipeline valor%' or lower(name) like '%brazil journal%' then 'src_valor_rss'
  when lower(name) like '%startups%' or lower(name) like '%fintech%' then 'src_google_news_rss'
  else coalesce(metadata->>'code', 'src_' || regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'))
end)
where metadata->>'code' is null;
