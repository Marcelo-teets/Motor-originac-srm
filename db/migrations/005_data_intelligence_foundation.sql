-- Data Intelligence foundation for the Origination Intelligence Platform
-- Focus: connectors, raw ingestion, enrichment, source facts and signal extraction.

create table if not exists connector_registry (
  id text primary key,
  name text not null,
  connector_type text not null,
  base_url text,
  auth_mode text not null default 'none',
  status text not null default 'active',
  owner text,
  cadence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_endpoints (
  id text primary key,
  connector_id text not null references connector_registry(id) on delete cascade,
  name text not null,
  category text not null,
  endpoint_url text not null,
  country text default 'BR',
  sector_hint text,
  parser_strategy text not null default 'json',
  extraction_mode text not null default 'api',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_source_endpoints_connector on source_endpoints(connector_id);
create index if not exists idx_source_endpoints_active on source_endpoints(is_active, category);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_endpoint_id text not null references source_endpoints(id) on delete cascade,
  run_type text not null default 'scheduled',
  status text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  http_status integer,
  records_seen integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_ingestion_runs_source_created on ingestion_runs(source_endpoint_id, created_at desc);
create index if not exists idx_ingestion_runs_status on ingestion_runs(status);

create table if not exists raw_documents (
  id uuid primary key default gen_random_uuid(),
  source_endpoint_id text not null references source_endpoints(id) on delete cascade,
  external_id text,
  canonical_url text,
  title text,
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  content_hash text,
  mime_type text,
  language text default 'pt-BR',
  raw_payload jsonb not null default '{}'::jsonb,
  parsed_text text,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists uq_raw_documents_source_external on raw_documents(source_endpoint_id, external_id);
create index if not exists idx_raw_documents_source_published on raw_documents(source_endpoint_id, published_at desc);
create index if not exists idx_raw_documents_hash on raw_documents(content_hash);

create table if not exists company_source_links (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  raw_document_id uuid not null references raw_documents(id) on delete cascade,
  match_method text not null default 'heuristic',
  confidence numeric(5,4) not null default 0.50,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_company_source_links on company_source_links(company_id, raw_document_id);
create index if not exists idx_company_source_links_company on company_source_links(company_id, created_at desc);

create table if not exists company_source_facts (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  raw_document_id uuid references raw_documents(id) on delete set null,
  fact_type text not null,
  fact_key text not null,
  fact_value text,
  numeric_value numeric(18,4),
  observed_at timestamptz,
  confidence numeric(5,4) not null default 0.50,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_company_source_facts_company on company_source_facts(company_id, fact_type, created_at desc);
create index if not exists idx_company_source_facts_key on company_source_facts(fact_key, created_at desc);

create table if not exists enrichment_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  snapshot_type text not null,
  source_count integer not null default 0,
  fact_count integer not null default 0,
  confidence numeric(5,4) not null default 0.50,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_enrichment_snapshots_company on enrichment_snapshots(company_id, snapshot_type, created_at desc);

create table if not exists signal_extractions (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  raw_document_id uuid references raw_documents(id) on delete set null,
  signal_type text not null,
  signal_strength integer not null default 50,
  confidence numeric(5,4) not null default 0.50,
  rationale text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_signal_extractions_company on signal_extractions(company_id, created_at desc);
create index if not exists idx_signal_extractions_type on signal_extractions(signal_type, created_at desc);

create table if not exists company_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  alias text not null,
  alias_type text not null default 'brand',
  created_at timestamptz not null default now()
);
create unique index if not exists uq_company_aliases on company_aliases(company_id, alias);

comment on table connector_registry is 'Catalog of connectors used by the Origination Intelligence Platform.';
comment on table source_endpoints is 'Endpoint-level registry for APIs, RSS feeds, websites and scraping targets.';
comment on table raw_documents is 'Canonical raw capture layer used before enrichment and scoring.';
comment on table company_source_facts is 'Structured facts extracted from source documents and linked back to companies.';
comment on table signal_extractions is 'Operational signal layer feeding qualification, patterns, ranking and pipeline timing.';
