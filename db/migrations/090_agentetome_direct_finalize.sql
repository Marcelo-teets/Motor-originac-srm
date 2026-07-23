-- Reuse the transactional package finalizer for direct provider exports while
-- keeping recovery-specific lineage out of normal successful runs.

create or replace function public.finalize_agentetome_direct_package(
  p_package_id uuid,
  p_headers jsonb,
  p_row_counts jsonb,
  p_bronze_rows integer,
  p_runtime text default 'agentetome-ingest-export-v2'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
  v_package public.agentetome_export_packages%rowtype;
begin
  v_result := public.finalize_agentetome_recovered_package(
    p_package_id,
    p_headers,
    p_row_counts,
    p_bronze_rows,
    p_runtime
  );

  select * into v_package
  from public.agentetome_export_packages
  where id=p_package_id;
  if not found then raise exception 'agentetome_package_not_found'; end if;

  update public.agentetome_export_packages
  set metadata=(metadata - 'recovered_from_private_storage' - 'recovered_at') || jsonb_build_object(
    'ingestion_mode','direct_export',
    'runtime',p_runtime,
    'raw_download_link_persisted',false
  ), updated_at=now()
  where id=p_package_id;

  update public.source_connector_runs
  set trigger_type='manual_real_export',
      metadata=(metadata - 'recovered_from_private_storage') || jsonb_build_object(
        'ingestion_mode','direct_export',
        'runtime',p_runtime
      )
  where id=v_package.connector_run_id;

  update public.capital_market_dataset_runs
  set trigger_type='manual_real_export',
      metadata=(metadata - 'recovered_from_private_storage') || jsonb_build_object(
        'ingestion_mode','direct_export',
        'runtime',p_runtime
      ),
      updated_at=now()
  where dataset_code='agentetome_admin_export_v1'
    and metadata->>'package_id'=p_package_id::text;

  update public.source_documents
  set normalized_payload=(normalized_payload - 'recovered_from_private_storage') || jsonb_build_object(
        'ingestion_mode','direct_export'
      ),
      raw_payload=raw_payload || jsonb_build_object('raw_download_link_persisted',false)
  where id='agentetome:'||v_package.content_hash;

  update public.agentetome_operation_runs
  set response_summary=(response_summary - 'recovered_from_private_storage') || jsonb_build_object(
        'ingestion_mode','direct_export',
        'runtime',p_runtime
      )
  where id=v_package.operation_run_id;

  return v_result || jsonb_build_object('ingestion_mode','direct_export');
end;
$$;

revoke all on function public.finalize_agentetome_direct_package(uuid,jsonb,jsonb,integer,text)
  from public, anon, authenticated;
grant execute on function public.finalize_agentetome_direct_package(uuid,jsonb,jsonb,integer,text)
  to service_role;

notify pgrst, 'reload schema';
