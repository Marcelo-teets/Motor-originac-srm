begin;

alter table public.data_archive_runs
  add column if not exists storage_provider text not null default 'supabase_storage';

alter table public.data_archive_parts
  add column if not exists storage_provider text not null default 'supabase_storage',
  add column if not exists external_file_id text,
  add column if not exists external_folder_id text,
  add column if not exists external_url text,
  add column if not exists migrated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'data_archive_runs_storage_provider_check'
      and conrelid = 'public.data_archive_runs'::regclass
  ) then
    alter table public.data_archive_runs
      add constraint data_archive_runs_storage_provider_check
      check (storage_provider in ('supabase_storage', 'google_drive'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'data_archive_parts_storage_provider_check'
      and conrelid = 'public.data_archive_parts'::regclass
  ) then
    alter table public.data_archive_parts
      add constraint data_archive_parts_storage_provider_check
      check (storage_provider in ('supabase_storage', 'google_drive'));
  end if;
end;
$$;

update public.data_archive_runs
set storage_provider = case
  when storage_bucket = 'google-drive' then 'google_drive'
  else 'supabase_storage'
end
where storage_provider is null
   or storage_provider not in ('supabase_storage', 'google_drive');

update public.data_archive_parts
set storage_provider = case
  when storage_bucket = 'google-drive' then 'google_drive'
  else 'supabase_storage'
end
where storage_provider is null
   or storage_provider not in ('supabase_storage', 'google_drive');

create index if not exists idx_data_archive_runs_provider_status
  on public.data_archive_runs (storage_provider, status, created_at desc);

create index if not exists idx_data_archive_parts_provider_run
  on public.data_archive_parts (storage_provider, run_id, part_number);

create unique index if not exists uq_data_archive_parts_external_file
  on public.data_archive_parts (external_file_id)
  where external_file_id is not null;

comment on column public.data_archive_runs.storage_provider is
  'Archive destination. supabase_storage is staging/legacy; google_drive is the long-term cold archive.';
comment on column public.data_archive_parts.external_file_id is
  'Google Drive file id when storage_provider=google_drive.';
comment on column public.data_archive_parts.external_url is
  'Private Google Drive web URL for the archived workbook.';

create table if not exists public.database_storage_snapshots (
  id bigint generated always as identity primary key,
  database_bytes bigint not null check (database_bytes >= 0),
  target_bytes bigint not null default 419430400,
  warning_bytes bigint not null default 445644800,
  critical_bytes bigint not null default 471859200,
  free_quota_bytes bigint not null default 524288000,
  state text not null check (state in ('healthy', 'warning', 'critical', 'quota_exceeded')),
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists idx_database_storage_snapshots_captured
  on public.database_storage_snapshots (captured_at desc);

alter table public.database_storage_snapshots enable row level security;
revoke all on table public.database_storage_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.database_storage_snapshots to service_role;

drop policy if exists database_storage_snapshots_service_role_all
  on public.database_storage_snapshots;
create policy database_storage_snapshots_service_role_all
  on public.database_storage_snapshots
  for all to service_role using (true) with check (true);

create or replace function private.capture_database_storage_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_database_bytes bigint := pg_database_size(current_database());
  v_target_bytes constant bigint := 419430400;
  v_warning_bytes constant bigint := 445644800;
  v_critical_bytes constant bigint := 471859200;
  v_quota_bytes constant bigint := 524288000;
  v_state text;
  v_id bigint;
begin
  v_state := case
    when v_database_bytes >= v_quota_bytes then 'quota_exceeded'
    when v_database_bytes >= v_critical_bytes then 'critical'
    when v_database_bytes >= v_warning_bytes then 'warning'
    else 'healthy'
  end;

  insert into public.database_storage_snapshots (
    database_bytes, target_bytes, warning_bytes, critical_bytes,
    free_quota_bytes, state, metadata
  ) values (
    v_database_bytes, v_target_bytes, v_warning_bytes, v_critical_bytes,
    v_quota_bytes, v_state,
    jsonb_build_object(
      'database_mb', round(v_database_bytes / 1024.0 / 1024.0, 2),
      'target_mb', 400,
      'warning_mb', 425,
      'critical_mb', 450,
      'free_quota_mb', 500
    )
  ) returning id into v_id;

  return jsonb_build_object(
    'snapshot_id', v_id,
    'database_bytes', v_database_bytes,
    'database_mb', round(v_database_bytes / 1024.0 / 1024.0, 2),
    'state', v_state,
    'target_bytes', v_target_bytes,
    'free_quota_bytes', v_quota_bytes,
    'captured_at', now()
  );
end;
$$;

revoke all on function private.capture_database_storage_snapshot()
  from public, anon, authenticated;
grant execute on function private.capture_database_storage_snapshot() to service_role;

create or replace view public.database_storage_health_v1
with (security_invoker = true)
as
select
  id,
  database_bytes,
  round(database_bytes / 1024.0 / 1024.0, 2) as database_mb,
  target_bytes,
  warning_bytes,
  critical_bytes,
  free_quota_bytes,
  state,
  metadata,
  captured_at
from public.database_storage_snapshots
order by captured_at desc
limit 1;

revoke all on table public.database_storage_health_v1 from public, anon, authenticated;
grant select on table public.database_storage_health_v1 to service_role;

insert into public.data_archive_policies (
  table_name, dataset_code, retention_mode, hot_retention_days,
  date_column, allow_prune, enabled, excel_sheet_prefix, notes
)
values
  ('bronze_historical_records', 'agentetome_fidc_aging_v1', 'full_row', 1, 'ingested_at', true, true, 'Bronze_AgenteTome_Aging', 'Raw Agentetome aging rows are archived after normalization.'),
  ('bronze_historical_records', 'agentetome_fidc_classes_v1', 'full_row', 1, 'ingested_at', true, true, 'Bronze_AgenteTome_Classes', 'Raw Agentetome class rows are archived after normalization.'),
  ('bronze_historical_records', 'agentetome_qualidade_operacional_v1', 'full_row', 1, 'ingested_at', true, true, 'Bronze_AgenteTome_Qualidade', 'Raw Agentetome quality rows are archived after normalization.'),
  ('bronze_historical_records', 'agentetome_fidc_consolidado_v1', 'full_row', 1, 'ingested_at', true, true, 'Bronze_AgenteTome_FIDC', 'Raw Agentetome FIDC rows are archived after normalization.'),
  ('bronze_historical_records', 'agentetome_fii_consolidado_v1', 'full_row', 1, 'ingested_at', true, true, 'Bronze_AgenteTome_FII', 'Raw Agentetome FII rows are archived after normalization.'),
  ('bronze_historical_records', 'agentetome_fundos_555_consolidado_v1', 'full_row', 1, 'ingested_at', true, true, 'Bronze_AgenteTome_555', 'Raw Agentetome 555 rows are archived after normalization.'),
  ('bronze_historical_records', 'cvm_securitization_ots', 'full_row', 1, 'ingested_at', true, true, 'Bronze_CVM_OTS', 'Raw CVM securitization rows are archived after normalization.'),
  ('bronze_historical_records', 'rfb_qsa', 'full_row', 1, 'ingested_at', true, true, 'Bronze_RFB_QSA', 'Raw QSA evidence is archived after normalized snapshots are persisted.')
on conflict (table_name, dataset_code) do update set
  retention_mode = excluded.retention_mode,
  hot_retention_days = excluded.hot_retention_days,
  date_column = excluded.date_column,
  allow_prune = excluded.allow_prune,
  enabled = excluded.enabled,
  excel_sheet_prefix = excluded.excel_sheet_prefix,
  notes = excluded.notes,
  updated_at = now();

update public.data_archive_policies
set hot_retention_days = 1,
    notes = case
      when table_name = 'bronze_historical_records'
        then 'Keep only a one-day replay window after normalization; full rows move to the cold archive.'
      when table_name = 'capital_market_events'
        then 'Keep normalized analytical columns online; archive heavy JSON payloads after one day.'
      when table_name = 'source_documents'
        then 'Keep hashes, URLs and lineage online; archive payloads after one day.'
      when table_name = 'monitoring_outputs'
        then 'Keep summaries and signal links online; archive raw text and payloads after one day.'
      else notes
    end,
    updated_at = now()
where table_name in (
  'bronze_historical_records',
  'capital_market_events',
  'source_documents',
  'monitoring_outputs'
)
  and allow_prune;

create or replace function private.queue_free_tier_archive_if_needed()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_health jsonb;
  v_state text;
  v_active integer;
  v_result jsonb;
begin
  v_health := private.capture_database_storage_snapshot();
  v_state := v_health ->> 'state';

  if v_state = 'healthy' then
    return jsonb_build_object('status', 'healthy', 'health', v_health);
  end if;

  select count(*) into v_active
  from public.data_archive_runs
  where status in ('queued', 'running', 'completed', 'verified');

  if v_active > 0 then
    return jsonb_build_object(
      'status', 'archive_already_active',
      'active_runs', v_active,
      'health', v_health
    );
  end if;

  v_result := private.queue_due_historical_excel_archives();

  return jsonb_build_object(
    'status', 'archive_requested',
    'health', v_health,
    'archive', v_result
  );
end;
$$;

revoke all on function private.queue_free_tier_archive_if_needed()
  from public, anon, authenticated;
grant execute on function private.queue_free_tier_archive_if_needed() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'historical-excel-queue';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  select jobid into v_job_id from cron.job where jobname = 'database-storage-budget';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'historical-excel-queue',
  '15 * * * *',
  $cron$select private.queue_due_historical_excel_archives();$cron$
);

select cron.schedule(
  'database-storage-budget',
  '5 */2 * * *',
  $cron$select private.queue_free_tier_archive_if_needed();$cron$
);

select private.capture_database_storage_snapshot();

commit;
