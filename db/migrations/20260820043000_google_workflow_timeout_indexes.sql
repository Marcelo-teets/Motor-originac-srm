create index if not exists idx_source_connector_runs_source_started_latest
  on public.source_connector_runs (source_id, started_at desc, id desc)
  where source_id is not null;

create index if not exists idx_data_archive_parts_google_candidates
  on public.data_archive_parts (created_at asc, id)
  where storage_provider = 'supabase_storage'
    and external_file_id is null;
