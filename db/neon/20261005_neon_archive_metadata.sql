-- Neon-native archive metadata tables. Google Sheets/Drive integrations consume these records.
-- No legacy storage-provider runtime dependency is retained.

create table if not exists public.data_archive_policies (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  dataset_code text not null default '*',
  retention_mode text not null check (retention_mode in ('full_row', 'payload_only', 'mirror_only')),
  hot_retention_days integer not null check (hot_retention_days >= 0),
  date_column text not null,
  allow_prune boolean not null default false,
  enabled boolean not null default true,
  excel_sheet_prefix text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (table_name, dataset_code)
);

create table if not exists public.data_archive_runs (
  id uuid primary key default gen_random_uuid(),
  archive_type text not null default 'historical_excel' check (archive_type = 'historical_excel'),
  table_name text not null,
  dataset_code text,
  cutoff_at timestamptz not null,
  include_raw_payload boolean not null default true,
  chunk_rows integer not null default 15000 check (chunk_rows between 1000 and 25000),
  status text not null default 'queued' check (status in ('queued','running','completed','verified','pruned','failed')),
  storage_bucket text not null default 'google-drive',
  row_count bigint not null default 0 check (row_count >= 0),
  part_count integer not null default 0 check (part_count >= 0),
  requested_by text,
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  pruned_at timestamptz,
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb,
  export_metadata jsonb not null default '{}'::jsonb,
  prune_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_data_archive_runs_status_created on public.data_archive_runs(status,created_at desc);
create index if not exists idx_data_archive_runs_table_cutoff on public.data_archive_runs(table_name,dataset_code,cutoff_at desc);

create table if not exists public.data_archive_parts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.data_archive_runs(id) on delete cascade,
  part_number integer not null check (part_number > 0),
  workbook_name text not null,
  storage_bucket text not null default 'google-drive',
  storage_path text not null,
  row_count bigint not null check (row_count >= 0),
  min_record_at timestamptz,
  max_record_at timestamptz,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes >= 0),
  columns jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id,part_number),
  unique(storage_bucket,storage_path)
);
create index if not exists idx_data_archive_parts_run on public.data_archive_parts(run_id,part_number);

create table if not exists public.data_archive_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists idx_data_archive_tokens_expiry on public.data_archive_tokens(expires_at) where consumed_at is null;

alter table public.data_archive_policies enable row level security;
alter table public.data_archive_runs enable row level security;
alter table public.data_archive_parts enable row level security;
alter table public.data_archive_tokens enable row level security;
revoke all on table public.data_archive_policies, public.data_archive_runs, public.data_archive_parts, public.data_archive_tokens from public, anon, authenticated;
grant select,insert,update,delete on table public.data_archive_policies, public.data_archive_runs, public.data_archive_parts, public.data_archive_tokens to service_role;
