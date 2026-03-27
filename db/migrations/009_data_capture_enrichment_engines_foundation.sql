create table if not exists source_connector_runs (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id) on delete cascade,
  source_id text references source_catalog(id),
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
create index if not exists idx_source_connector_runs_company on source_connector_runs(company_id, started_at desc);
create index if not exists idx_source_connector_runs_source on source_connector_runs(source_id, started_at desc);

create table if not exists source_documents (
  id text primary key,
  run_id uuid references source_connector_runs(id) on delete set null,
  company_id text references companies(id) on delete cascade,
  source_id text references source_catalog(id),
  document_type text not null,
  external_id text,
  canonical_url text,
  title text,
  published_at timestamptz,
  observed_at timestamptz not null default now(),
  content_hash text,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'normalized'
);
create index if not exists idx_source_documents_company on source_documents(company_id, observed_at desc);
create index if not exists idx_source_documents_source on source_documents(source_id, observed_at desc);
create unique index if not exists uq_source_documents_fingerprint on source_documents(company_id, source_id, content_hash);

create table if not exists company_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  alias_type text not null,
  alias_value text not null,
  source_id text references source_catalog(id),
  confidence_score numeric(5,2) not null default 0.75,
  created_at timestamptz not null default now(),
  unique(company_id, alias_type, alias_value)
);
create index if not exists idx_company_entity_aliases_company on company_entity_aliases(company_id, created_at desc);
