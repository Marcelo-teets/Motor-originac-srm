-- Enforce the approved hot/cold retention policy and make legacy archive parts
-- eligible for Google Drive externalization.
--
-- SAFETY:
-- - This migration never deletes source rows.
-- - Pruning remains governed by public.prune_verified_excel_archive_run(),
--   which requires a verified archive, checksums and row-count reconciliation.
-- - Decision-critical analytical history remains online (mirror_only / no prune).

begin;

-- ---------------------------------------------------------------------------
-- 1) Keep operational retention policy aligned with the current archive catalog.
-- ---------------------------------------------------------------------------
update public.data_archive_policies
set
  hot_retention_days = 1,
  retention_mode = 'full_row',
  date_column = 'ingested_at',
  allow_prune = true,
  enabled = true,
  updated_at = now(),
  notes = concat_ws(' ', nullif(notes, ''), 'Operational hot window: 1 day. Source rows may only be pruned after verified XLSX archive reconciliation.')
where table_name = 'bronze_historical_records';

update public.data_archive_policies
set
  hot_retention_days = 1,
  retention_mode = 'payload_only',
  date_column = 'observed_at',
  allow_prune = true,
  enabled = true,
  updated_at = now(),
  notes = concat_ws(' ', nullif(notes, ''), 'Operational hot window: 1 day. Keep normalized analytical columns online; externalize heavy payload only after verified archive.')
where table_name in ('capital_market_events', 'source_documents', 'monitoring_outputs');

-- Decision-critical layers are always retained in Supabase.
update public.data_archive_policies
set
  hot_retention_days = 0,
  retention_mode = 'mirror_only',
  allow_prune = false,
  enabled = true,
  updated_at = now(),
  notes = concat_ws(' ', nullif(notes, ''), 'Protected analytical layer: mirror to archive when useful, never prune from Supabase through the historical Excel policy.')
where table_name in (
  'company_factor_observations',
  'company_signals',
  'lead_score_snapshots',
  'qualification_snapshots',
  'score_snapshots'
);

-- ---------------------------------------------------------------------------
-- 2) Normalize Google Drive externalization metadata on legacy archive parts.
--    ADD IF NOT EXISTS keeps this migration compatible with deployments where
--    the Drive columns were already introduced by an earlier migration.
-- ---------------------------------------------------------------------------
alter table public.data_archive_parts
  add column if not exists storage_provider text,
  add column if not exists external_file_id text,
  add column if not exists external_url text,
  add column if not exists external_folder_id text,
  add column if not exists migrated_at timestamptz;

alter table public.data_archive_parts
  alter column storage_provider set default 'supabase_storage';

-- Historical parts created before the Drive tier did not have provider metadata.
-- They already point to the private Supabase Storage staging bucket, so marking
-- them as supabase_storage makes them visible to the existing Drive migrator.
update public.data_archive_parts
set storage_provider = 'supabase_storage'
where storage_provider is null
  and storage_path is not null
  and external_file_id is null;

create index if not exists idx_data_archive_parts_drive_pending
  on public.data_archive_parts (created_at, run_id)
  where storage_provider = 'supabase_storage'
    and external_file_id is null;

create index if not exists idx_data_archive_parts_external_file
  on public.data_archive_parts (external_file_id)
  where external_file_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Read-only operational view for the cold-storage backlog.
-- ---------------------------------------------------------------------------
create or replace view public.google_cold_archive_backlog_v1 as
select
  p.id as part_id,
  p.run_id,
  r.table_name,
  r.dataset_code,
  r.status as run_status,
  p.workbook_name,
  p.storage_bucket,
  p.storage_path,
  p.row_count,
  p.size_bytes,
  p.sha256,
  p.created_at,
  p.storage_provider,
  p.external_file_id,
  p.external_url,
  p.external_folder_id,
  p.migrated_at
from public.data_archive_parts p
join public.data_archive_runs r on r.id = p.run_id
where p.storage_provider = 'supabase_storage'
  and p.external_file_id is null
  and r.status in ('completed', 'verified', 'pruned');

revoke all on public.google_cold_archive_backlog_v1 from public, anon, authenticated;
grant select on public.google_cold_archive_backlog_v1 to service_role;

comment on view public.google_cold_archive_backlog_v1 is
  'Verified/completed/pruned XLSX archive parts still staged in Supabase Storage and pending migration to Google Drive.';

commit;
