begin;

update public.data_archive_policies
set enabled = false,
    notes = coalesce(notes, '') || ' Disabled by migration 137: capital-market payload archives now run per dataset.',
    updated_at = now()
where table_name = 'capital_market_events'
  and dataset_code = '*';

insert into public.data_archive_policies (
  table_name, dataset_code, retention_mode, hot_retention_days, date_column,
  enabled, allow_prune, excel_sheet_prefix, notes
)
select
  'capital_market_events',
  dataset_code,
  'payload_only',
  1,
  'observed_at',
  true,
  true,
  left('CM_' || regexp_replace(dataset_code, '^cvm_', ''), 31),
  'Archive heavy event payloads per dataset; preserve normalized event columns, metrics and decision-useful entity links online.'
from (
  values
    ('cvm_offers'),
    ('cvm_fund_registry'),
    ('cvm_fidc_monthly'),
    ('cvm_cri_monthly'),
    ('cvm_cra_monthly'),
    ('cvm_fii_monthly'),
    ('cvm_securitization_ots'),
    ('cvm_fund_documents'),
    ('cvm_fund_document_deliveries'),
    ('cvm_company_fre'),
    ('cvm_company_itr'),
    ('cvm_company_dfp')
) datasets(dataset_code)
on conflict (table_name, dataset_code) do update set
  retention_mode = excluded.retention_mode,
  hot_retention_days = excluded.hot_retention_days,
  date_column = excluded.date_column,
  enabled = excluded.enabled,
  allow_prune = excluded.allow_prune,
  excel_sheet_prefix = excluded.excel_sheet_prefix,
  notes = excluded.notes,
  updated_at = now();

create or replace function private.queue_due_historical_excel_archives()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_policy public.data_archive_policies%rowtype;
  v_cutoff timestamptz;
  v_has_rows boolean;
  v_chunk_rows integer;
  v_result jsonb;
begin
  for v_policy in
    select *
    from public.data_archive_policies
    where enabled
      and allow_prune
    order by
      case table_name
        when 'bronze_historical_records' then 1
        when 'source_documents' then 2
        when 'monitoring_outputs' then 3
        when 'capital_market_events' then 4
        else 9
      end,
      dataset_code
  loop
    v_cutoff := now() - make_interval(days => v_policy.hot_retention_days);
    v_has_rows := false;

    if v_policy.table_name = 'bronze_historical_records' then
      select exists (
        select 1
        from public.bronze_historical_records
        where ingested_at <= v_cutoff
          and (v_policy.dataset_code = '*' or dataset_code = v_policy.dataset_code)
      ) into v_has_rows;
    elsif v_policy.table_name = 'capital_market_events' then
      select exists (
        select 1
        from public.capital_market_events
        where observed_at <= v_cutoff
          and (v_policy.dataset_code = '*' or dataset_code = v_policy.dataset_code)
          and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb)
      ) into v_has_rows;
    elsif v_policy.table_name = 'source_documents' then
      select exists (
        select 1 from public.source_documents
        where observed_at <= v_cutoff
          and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb)
      ) into v_has_rows;
    elsif v_policy.table_name = 'monitoring_outputs' then
      select exists (
        select 1 from public.monitoring_outputs
        where observed_at <= v_cutoff
          and (
            raw_text is not null or payload <> '{}'::jsonb or
            output_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb
          )
      ) into v_has_rows;
    end if;

    if not v_has_rows then
      continue;
    end if;

    if exists (
      select 1
      from public.data_archive_runs
      where table_name = v_policy.table_name
        and coalesce(dataset_code, '*') = v_policy.dataset_code
        and status in ('queued', 'running', 'completed', 'verified')
        and cutoff_at >= v_cutoff - interval '1 day'
    ) then
      continue;
    end if;

    v_chunk_rows := case
      when v_policy.table_name = 'capital_market_events' then 100
      when v_policy.table_name = 'bronze_historical_records'
           and v_policy.dataset_code = 'cvm_fund_registry' then 500
      when v_policy.table_name = 'bronze_historical_records' then 250
      else 500
    end;

    v_result := private.queue_historical_excel_export(
      p_table_name := v_policy.table_name,
      p_dataset_code := case when v_policy.dataset_code = '*' then null else v_policy.dataset_code end,
      p_cutoff := v_cutoff,
      p_include_raw_payload := true,
      p_chunk_rows := v_chunk_rows,
      p_requested_by := 'pg_cron:historical-excel-queue'
    );

    return jsonb_build_object(
      'status', 'queued_one',
      'table_name', v_policy.table_name,
      'dataset_code', v_policy.dataset_code,
      'cutoff_at', v_cutoff,
      'result', v_result
    );
  end loop;

  return jsonb_build_object('status', 'nothing_due', 'checked_at', now());
end;
$function$;

revoke all on function private.queue_due_historical_excel_archives()
  from public, anon, authenticated;
grant execute on function private.queue_due_historical_excel_archives()
  to service_role, postgres;

commit;
