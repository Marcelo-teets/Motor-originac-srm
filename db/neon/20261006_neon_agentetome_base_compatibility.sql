-- Neon-native Agentetome persistence prerequisites.
-- Keeps provider secrets and file transport outside Postgres; only operational metadata is persisted.

create table if not exists public.agentetome_operation_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.source_catalog(id) on delete set null,
  requested_by uuid,
  operation text not null check (operation in ('validate_fidc_xml','admin_manifest','admin_export')),
  status text not null check (status in ('completed','partial','failed','blocked')),
  administrator text,
  competence text,
  format text,
  request_fingerprint text,
  response_summary jsonb not null default '{}'::jsonb,
  http_status integer,
  retry_after_seconds integer,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists agentetome_operation_runs_created_at_idx
  on public.agentetome_operation_runs(created_at desc);
create index if not exists agentetome_operation_runs_source_id_idx
  on public.agentetome_operation_runs(source_id) where source_id is not null;
create index if not exists agentetome_operation_runs_requested_by_idx
  on public.agentetome_operation_runs(requested_by) where requested_by is not null;

alter table public.agentetome_operation_runs enable row level security;
revoke all on table public.agentetome_operation_runs from public, anon, authenticated;
grant all on table public.agentetome_operation_runs to service_role;
drop policy if exists agentetome_operation_runs_service_role_all on public.agentetome_operation_runs;
create policy agentetome_operation_runs_service_role_all
  on public.agentetome_operation_runs for all to service_role using (true) with check (true);

create table if not exists public.agentetome_export_packages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.source_catalog(id) on delete set null,
  connector_run_id uuid references public.source_connector_runs(id) on delete set null,
  operation_run_id uuid references public.agentetome_operation_runs(id) on delete set null,
  administrator text not null,
  cut text not null check (cut in ('recente','competencia')),
  competence text,
  format text not null check (format in ('csv','xlsx')),
  schema_version integer not null default 1 check (schema_version > 0),
  provider_file_name text not null,
  provider_generated_at timestamptz,
  provider_expires_at timestamptz,
  storage_bucket text not null default 'external',
  storage_path text not null,
  content_hash text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  mime_type text,
  file_count integer not null default 0 check (file_count >= 0),
  row_counts jsonb not null default '{}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  status text not null default 'stored' check (status in ('stored','parsed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(content_hash),
  unique(storage_bucket,storage_path)
);

create index if not exists agentetome_export_packages_admin_created_idx
  on public.agentetome_export_packages(administrator,created_at desc);
alter table public.agentetome_export_packages enable row level security;
revoke all on table public.agentetome_export_packages from public, anon, authenticated;
grant all on table public.agentetome_export_packages to service_role;
drop policy if exists agentetome_export_packages_service_role_all on public.agentetome_export_packages;
create policy agentetome_export_packages_service_role_all
  on public.agentetome_export_packages for all to service_role using (true) with check (true);

create table if not exists public.agentetome_ingestion_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null default 'agentetome_raw_ingestion',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists agentetome_ingestion_tokens_expiry_idx
  on public.agentetome_ingestion_tokens(expires_at) where consumed_at is null;
alter table public.agentetome_ingestion_tokens enable row level security;
revoke all on table public.agentetome_ingestion_tokens from public, anon, authenticated;
grant all on table public.agentetome_ingestion_tokens to service_role;
drop policy if exists agentetome_ingestion_tokens_service_role_all on public.agentetome_ingestion_tokens;
create policy agentetome_ingestion_tokens_service_role_all
  on public.agentetome_ingestion_tokens for all to service_role using (true) with check (true);
