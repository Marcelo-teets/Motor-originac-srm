create extension if not exists pg_cron;

create or replace function private.queue_due_historical_excel_archives()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
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
        select 1 from public.capital_market_events
        where observed_at <= v_cutoff
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

    if not v_has_rows then continue; end if;

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
$$;

revoke all on function private.queue_due_historical_excel_archives()
  from public, anon, authenticated;
grant execute on function private.queue_due_historical_excel_archives()
  to service_role;

create or replace function private.reconcile_historical_excel_archives()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_run public.data_archive_runs%rowtype;
  v_policy public.data_archive_policies%rowtype;
  v_verified jsonb;
  v_pruned jsonb;
begin
  select * into v_run
  from public.data_archive_runs
  where status in ('completed', 'verified')
  order by created_at
  limit 1
  for update skip locked;

  if v_run.id is null then
    return jsonb_build_object('status', 'nothing_to_reconcile', 'checked_at', now());
  end if;

  begin
    if v_run.status = 'completed' then
      v_verified := private.verify_historical_excel_export(
        v_run.id,
        'pg_cron:historical-excel-reconcile'
      );
      select * into v_run from public.data_archive_runs where id = v_run.id;
    end if;

    select * into v_policy
    from public.data_archive_policies
    where table_name = v_run.table_name
      and dataset_code in (coalesce(v_run.dataset_code, '*'), '*')
      and enabled
    order by (dataset_code = coalesce(v_run.dataset_code, '*')) desc
    limit 1;

    if v_run.status = 'verified' and coalesce(v_policy.allow_prune, false) then
      v_pruned := private.prune_verified_historical_archive(v_run.id);
    end if;

    update public.data_archive_runs
    set request_metadata = request_metadata - 'reconcile_error' || jsonb_build_object(
          'last_reconciled_at', now()
        ),
        updated_at = now()
    where id = v_run.id;

    return jsonb_build_object(
      'status', 'reconciled',
      'run_id', v_run.id,
      'verification', v_verified,
      'prune', v_pruned
    );
  exception when others then
    update public.data_archive_runs
    set request_metadata = request_metadata || jsonb_build_object(
          'reconcile_error', sqlerrm,
          'last_reconcile_attempt_at', now()
        ),
        updated_at = now()
    where id = v_run.id;

    return jsonb_build_object(
      'status', 'retry_later',
      'run_id', v_run.id,
      'error', sqlerrm
    );
  end;
end;
$$;

revoke all on function private.reconcile_historical_excel_archives()
  from public, anon, authenticated;
grant execute on function private.reconcile_historical_excel_archives()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'historical-excel-reconcile';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  select jobid into v_job_id from cron.job where jobname = 'historical-excel-queue';
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'historical-excel-reconcile',
  '*/15 * * * *',
  $cron$select private.reconcile_historical_excel_archives();$cron$
);

select cron.schedule(
  'historical-excel-queue',
  '0 5 * * *',
  $cron$select private.queue_due_historical_excel_archives();$cron$
);
