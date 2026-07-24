create or replace function private.verify_historical_excel_export(
  p_run_id uuid,
  p_verified_by text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.data_archive_runs%rowtype;
  v_parts integer;
  v_rows bigint;
  v_source_rows bigint;
begin
  select * into v_run
  from public.data_archive_runs
  where id = p_run_id
  for update;

  if v_run.id is null then raise exception 'archive_run_not_found'; end if;
  if v_run.status <> 'completed' then raise exception 'archive_run_not_completed'; end if;

  select count(*), coalesce(sum(row_count), 0)
  into v_parts, v_rows
  from public.data_archive_parts
  where run_id = p_run_id
    and sha256 ~ '^[0-9a-f]{64}$'
    and size_bytes > 0;

  if v_parts = 0 then raise exception 'archive_run_without_parts'; end if;
  if v_parts <> v_run.part_count then raise exception 'archive_part_count_mismatch'; end if;
  if v_rows <> v_run.row_count then raise exception 'archive_row_count_mismatch'; end if;

  if v_run.table_name = 'capital_market_events' then
    select count(*) into v_source_rows from public.capital_market_events
    where observed_at <= v_run.cutoff_at
      and (v_run.dataset_code is null or dataset_code = v_run.dataset_code);
  elsif v_run.table_name = 'bronze_historical_records' then
    select count(*) into v_source_rows from public.bronze_historical_records
    where ingested_at <= v_run.cutoff_at
      and (v_run.dataset_code is null or dataset_code = v_run.dataset_code);
  elsif v_run.table_name = 'source_documents' then
    select count(*) into v_source_rows from public.source_documents where observed_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'monitoring_outputs' then
    select count(*) into v_source_rows from public.monitoring_outputs where observed_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'company_signals' then
    select count(*) into v_source_rows from public.company_signals where observed_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'company_factor_observations' then
    select count(*) into v_source_rows from public.company_factor_observations where observed_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'score_snapshots' then
    select count(*) into v_source_rows from public.score_snapshots where created_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'qualification_snapshots' then
    select count(*) into v_source_rows from public.qualification_snapshots where created_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'lead_score_snapshots' then
    select count(*) into v_source_rows from public.lead_score_snapshots where created_at <= v_run.cutoff_at;
  else
    raise exception 'archive_table_not_allowed';
  end if;

  if v_source_rows <> v_run.row_count then
    raise exception 'archive_source_row_count_mismatch: source %, archive %', v_source_rows, v_run.row_count;
  end if;

  update public.data_archive_runs
  set status = 'verified',
      verified_at = now(),
      export_metadata = export_metadata || jsonb_build_object(
        'verified_by', coalesce(nullif(trim(p_verified_by), ''), 'system'),
        'verified_parts', v_parts,
        'verified_rows', v_rows,
        'source_rows_at_cutoff', v_source_rows
      ),
      updated_at = now()
  where id = p_run_id;

  return jsonb_build_object(
    'status', 'verified',
    'run_id', p_run_id,
    'parts', v_parts,
    'rows', v_rows,
    'source_rows', v_source_rows
  );
end;
$$;

revoke all on function private.verify_historical_excel_export(uuid, text)
  from public, anon, authenticated;
grant execute on function private.verify_historical_excel_export(uuid, text)
  to service_role;
