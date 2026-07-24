-- Governed Excel archive tier and conservative database optimizations.
-- No historical row is deleted by this migration. Pruning requires a completed,
-- verified archive run with row counts and SHA-256 checksums for every workbook part.

create index if not exists idx_candidate_official_enrichments_source_id
  on public.candidate_official_enrichments (source_id)
  where source_id is not null;

create index if not exists idx_capital_market_events_business_date_brin
  on public.capital_market_events using brin ((coalesce(event_date, reference_date)))
  with (pages_per_range = 64);
create index if not exists idx_capital_market_events_observed_at_brin
  on public.capital_market_events using brin (observed_at)
  with (pages_per_range = 64);
create index if not exists idx_bronze_historical_records_ref_date_brin
  on public.bronze_historical_records using brin (ref_date)
  with (pages_per_range = 64);
create index if not exists idx_bronze_historical_records_ingested_at_brin
  on public.bronze_historical_records using brin (ingested_at)
  with (pages_per_range = 64);
create index if not exists idx_source_documents_observed_at_brin
  on public.source_documents using brin (observed_at)
  with (pages_per_range = 64);
create index if not exists idx_monitoring_outputs_observed_at_brin
  on public.monitoring_outputs using brin (observed_at)
  with (pages_per_range = 64);
create index if not exists idx_qualification_snapshots_company_created
  on public.qualification_snapshots (company_id, created_at desc);

revoke all on table public.candidate_entity_classifications from public, anon, authenticated;
grant select, insert, update, delete on table public.candidate_entity_classifications to service_role;
drop policy if exists candidate_entity_classifications_service_role_all
  on public.candidate_entity_classifications;
create policy candidate_entity_classifications_service_role_all
  on public.candidate_entity_classifications
  for all to service_role using (true) with check (true);

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
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'verified', 'pruned', 'failed')),
  storage_bucket text not null default 'historical-excel-archive',
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

create index if not exists idx_data_archive_runs_status_created
  on public.data_archive_runs (status, created_at desc);
create index if not exists idx_data_archive_runs_table_cutoff
  on public.data_archive_runs (table_name, dataset_code, cutoff_at desc);

create table if not exists public.data_archive_parts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.data_archive_runs(id) on delete cascade,
  part_number integer not null check (part_number > 0),
  workbook_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  row_count bigint not null check (row_count >= 0),
  min_record_at timestamptz,
  max_record_at timestamptz,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes >= 0),
  columns jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, part_number),
  unique (storage_bucket, storage_path)
);
create index if not exists idx_data_archive_parts_run
  on public.data_archive_parts (run_id, part_number);

create table if not exists public.data_archive_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists idx_data_archive_tokens_expiry
  on public.data_archive_tokens (expires_at)
  where consumed_at is null;

alter table public.data_archive_policies enable row level security;
alter table public.data_archive_runs enable row level security;
alter table public.data_archive_parts enable row level security;
alter table public.data_archive_tokens enable row level security;

revoke all on table public.data_archive_policies from public, anon, authenticated;
revoke all on table public.data_archive_runs from public, anon, authenticated;
revoke all on table public.data_archive_parts from public, anon, authenticated;
revoke all on table public.data_archive_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.data_archive_policies to service_role;
grant select, insert, update, delete on table public.data_archive_runs to service_role;
grant select, insert, update, delete on table public.data_archive_parts to service_role;
grant select, insert, update, delete on table public.data_archive_tokens to service_role;

drop policy if exists data_archive_policies_service_role_all on public.data_archive_policies;
create policy data_archive_policies_service_role_all on public.data_archive_policies
  for all to service_role using (true) with check (true);
drop policy if exists data_archive_runs_service_role_all on public.data_archive_runs;
create policy data_archive_runs_service_role_all on public.data_archive_runs
  for all to service_role using (true) with check (true);
drop policy if exists data_archive_parts_service_role_all on public.data_archive_parts;
create policy data_archive_parts_service_role_all on public.data_archive_parts
  for all to service_role using (true) with check (true);
drop policy if exists data_archive_tokens_service_role_all on public.data_archive_tokens;
create policy data_archive_tokens_service_role_all on public.data_archive_tokens
  for all to service_role using (true) with check (true);

insert into public.data_archive_policies (
  table_name, dataset_code, retention_mode, hot_retention_days,
  date_column, allow_prune, excel_sheet_prefix, notes
)
values
  ('bronze_historical_records', 'cvm_fund_registry', 'full_row', 30, 'ingested_at', true, 'Bronze_CVM_Fundos', 'Raw registry rows are archived after normalization into capital_market_events.'),
  ('bronze_historical_records', 'cvm_offers', 'full_row', 30, 'ingested_at', true, 'Bronze_CVM_Ofertas', 'Raw offer rows are archived after normalization into capital_market_events.'),
  ('bronze_historical_records', 'cvm_fii_monthly', 'full_row', 30, 'ingested_at', true, 'Bronze_FII_Mensal', 'Raw monthly rows are archived after normalization.'),
  ('bronze_historical_records', 'cvm_fidc_monthly', 'full_row', 30, 'ingested_at', true, 'Bronze_FIDC_Mensal', 'Raw monthly rows are archived after normalization.'),
  ('bronze_historical_records', 'cvm_cra_monthly', 'full_row', 30, 'ingested_at', true, 'Bronze_CRA_Mensal', 'Raw monthly rows are archived after normalization.'),
  ('bronze_historical_records', 'cvm_cri_monthly', 'full_row', 30, 'ingested_at', true, 'Bronze_CRI_Mensal', 'Raw monthly rows are archived after normalization.'),
  ('capital_market_events', '*', 'payload_only', 730, 'observed_at', true, 'Mercado_Capitais', 'Keep normalized analytical columns in Postgres; archive large JSON payloads after two years.'),
  ('source_documents', '*', 'payload_only', 180, 'observed_at', true, 'Documentos_Fontes', 'Keep fingerprints, URLs and lineage; archive JSON payloads after six months.'),
  ('monitoring_outputs', '*', 'payload_only', 180, 'observed_at', true, 'Monitoramento', 'Keep summaries and downstream signals; archive raw text and payloads after six months.'),
  ('company_signals', '*', 'mirror_only', 0, 'observed_at', false, 'Sinais', 'Decision evidence remains online; Excel is a secondary mirror.'),
  ('company_factor_observations', '*', 'mirror_only', 0, 'observed_at', false, 'Fatores', 'Pattern-engine evidence remains online; Excel is a secondary mirror.'),
  ('score_snapshots', '*', 'mirror_only', 0, 'created_at', false, 'Historico_Score', 'Small and critical time series remains in Supabase.'),
  ('qualification_snapshots', '*', 'mirror_only', 0, 'created_at', false, 'Historico_Qualificacao', 'Small and critical time series remains in Supabase.'),
  ('lead_score_snapshots', '*', 'mirror_only', 0, 'created_at', false, 'Historico_Lead_Score', 'Small and critical time series remains in Supabase.')
on conflict (table_name, dataset_code) do update set
  retention_mode = excluded.retention_mode,
  hot_retention_days = excluded.hot_retention_days,
  date_column = excluded.date_column,
  allow_prune = excluded.allow_prune,
  enabled = true,
  excel_sheet_prefix = excluded.excel_sheet_prefix,
  notes = excluded.notes,
  updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'historical-excel-archive',
  'historical-excel-archive',
  false,
  52428800,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_data_archive_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.data_archive_tokens%rowtype;
begin
  update public.data_archive_tokens
  set consumed_at = now()
  where token_hash = p_token_hash
    and consumed_at is null
    and expires_at > now()
  returning * into v_token;

  if v_token.id is null then return null; end if;
  return jsonb_build_object('id', v_token.id, 'expires_at', v_token.expires_at, 'metadata', v_token.metadata);
end;
$$;
revoke all on function public.claim_data_archive_token(text) from public, anon, authenticated;
grant execute on function public.claim_data_archive_token(text) to service_role;

create or replace function private.queue_historical_excel_export(
  p_table_name text,
  p_dataset_code text default null,
  p_cutoff timestamptz default now(),
  p_include_raw_payload boolean default true,
  p_chunk_rows integer default 15000,
  p_requested_by text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private, net
as $$
declare
  v_allowed_tables constant text[] := array[
    'capital_market_events', 'bronze_historical_records', 'source_documents',
    'monitoring_outputs', 'company_signals', 'company_factor_observations',
    'score_snapshots', 'qualification_snapshots', 'lead_score_snapshots'
  ];
  v_run_id uuid;
  v_token text;
  v_token_hash text;
  v_token_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_request_id bigint;
  v_dataset_code text := nullif(trim(p_dataset_code), '');
begin
  if not (p_table_name = any(v_allowed_tables)) then raise exception 'archive_table_not_allowed'; end if;
  if p_chunk_rows < 1000 or p_chunk_rows > 25000 then raise exception 'archive_chunk_rows_out_of_range'; end if;
  if p_cutoff > now() + interval '1 minute' then raise exception 'archive_cutoff_in_future'; end if;

  insert into public.data_archive_runs (
    table_name, dataset_code, cutoff_at, include_raw_payload,
    chunk_rows, status, requested_by, request_metadata
  )
  values (
    p_table_name, v_dataset_code, p_cutoff, p_include_raw_payload,
    p_chunk_rows, 'queued', nullif(trim(p_requested_by), ''),
    jsonb_build_object('queued_at', now(), 'source', 'private.queue_historical_excel_export')
  ) returning id into v_run_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into public.data_archive_tokens (token_hash, expires_at, metadata)
  values (
    v_token_hash, v_expires_at,
    jsonb_build_object(
      'run_id', v_run_id,
      'table_name', p_table_name,
      'dataset_code', v_dataset_code,
      'cutoff_at', p_cutoff,
      'include_raw_payload', p_include_raw_payload,
      'chunk_rows', least(p_chunk_rows, 1000),
      'offset', 0,
      'part_number', 1
    )
  ) returning id into v_token_id;

  v_request_id := net.http_post(
    url := 'https://hdghpmssudrqhsbvrdyt.supabase.co/functions/v1/historical-excel-export',
    body := jsonb_build_object('runId', v_run_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json',
      'x-archive-token', v_token
    ),
    timeout_milliseconds := 120000
  );

  update public.data_archive_runs
  set request_metadata = request_metadata || jsonb_build_object(
        'pg_net_request_id', v_request_id,
        'token_id', v_token_id,
        'token_expires_at', v_expires_at
      ),
      updated_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'status', 'queued',
    'run_id', v_run_id,
    'pg_net_request_id', v_request_id,
    'token_expires_at', v_expires_at
  );
end;
$$;
revoke all on function private.queue_historical_excel_export(text, text, timestamptz, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function private.queue_historical_excel_export(text, text, timestamptz, boolean, integer, text)
  to service_role;

create or replace function private.prune_verified_historical_archive(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.data_archive_runs%rowtype;
  v_policy public.data_archive_policies%rowtype;
  v_affected bigint := 0;
  v_parts integer;
  v_rows bigint;
begin
  select * into v_run from public.data_archive_runs where id = p_run_id for update;
  if v_run.id is null then raise exception 'archive_run_not_found'; end if;
  if v_run.status <> 'verified' then raise exception 'archive_run_not_verified'; end if;

  select * into v_policy
  from public.data_archive_policies
  where table_name = v_run.table_name
    and dataset_code in (coalesce(v_run.dataset_code, '*'), '*')
    and enabled
  order by (dataset_code = coalesce(v_run.dataset_code, '*')) desc
  limit 1;
  if v_policy.id is null or not v_policy.allow_prune then raise exception 'archive_policy_does_not_allow_prune'; end if;

  select count(*), coalesce(sum(row_count), 0) into v_parts, v_rows
  from public.data_archive_parts
  where run_id = p_run_id and sha256 ~ '^[0-9a-f]{64}$' and size_bytes > 0;
  if v_parts <> v_run.part_count or v_rows <> v_run.row_count then raise exception 'archive_manifest_not_valid'; end if;

  if v_run.table_name = 'bronze_historical_records' then
    delete from public.bronze_historical_records
    where ingested_at <= v_run.cutoff_at
      and (v_run.dataset_code is null or dataset_code = v_run.dataset_code);
    get diagnostics v_affected = row_count;
  elsif v_run.table_name = 'capital_market_events' then
    update public.capital_market_events
    set raw_payload = '{}'::jsonb, normalized_payload = '{}'::jsonb, updated_at = now()
    where observed_at <= v_run.cutoff_at
      and (v_run.dataset_code is null or dataset_code = v_run.dataset_code)
      and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb);
    get diagnostics v_affected = row_count;
  elsif v_run.table_name = 'source_documents' then
    update public.source_documents
    set raw_payload = '{}'::jsonb, normalized_payload = '{}'::jsonb
    where observed_at <= v_run.cutoff_at
      and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb);
    get diagnostics v_affected = row_count;
  elsif v_run.table_name = 'monitoring_outputs' then
    update public.monitoring_outputs
    set raw_text = null, payload = '{}'::jsonb, output_payload = '{}'::jsonb,
        normalized_payload = '{}'::jsonb, updated_at = now()
    where observed_at <= v_run.cutoff_at
      and (raw_text is not null or payload <> '{}'::jsonb or output_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb);
    get diagnostics v_affected = row_count;
  else
    raise exception 'archive_table_is_mirror_only';
  end if;

  update public.data_archive_runs
  set status = 'pruned', pruned_at = now(),
      prune_result = jsonb_build_object('affected_rows', v_affected, 'retention_mode', v_policy.retention_mode, 'pruned_at', now()),
      updated_at = now()
  where id = p_run_id;

  return jsonb_build_object('status', 'pruned', 'run_id', p_run_id, 'affected_rows', v_affected, 'retention_mode', v_policy.retention_mode);
end;
$$;
revoke all on function private.prune_verified_historical_archive(uuid) from public, anon, authenticated;
grant execute on function private.prune_verified_historical_archive(uuid) to service_role;
