-- Post-rollout hardening for the hot/cold archive scheduler.
-- Keeps the existing architecture and makes the hourly queue bounded,
-- observable and recoverable as capital_market_events grows.

create index if not exists idx_capital_market_events_archive_dataset_due
  on public.capital_market_events (dataset_code, observed_at, record_key)
  where raw_payload <> '{}'::jsonb
     or normalized_payload <> '{}'::jsonb;

create index if not exists idx_data_archive_runs_active_updated
  on public.data_archive_runs (updated_at, id)
  where status in ('queued', 'running');

create index if not exists idx_data_archive_tokens_active_run
  on public.data_archive_tokens ((metadata ->> 'run_id'), expires_at)
  where consumed_at is null;

create or replace function private.expire_stale_historical_archive_runs(
  p_stale_after interval default interval '30 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_expired integer := 0;
begin
  if p_stale_after < interval '5 minutes' then
    raise exception 'archive_stale_window_too_small';
  end if;

  with stale as (
    select run.id
    from public.data_archive_runs run
    where run.status in ('queued', 'running')
      and run.updated_at < now() - p_stale_after
      and not exists (
        select 1
        from public.data_archive_tokens token
        where token.metadata ->> 'run_id' = run.id::text
          and token.consumed_at is null
          and token.expires_at > now()
      )
    order by run.updated_at
    for update skip locked
  ), expired as (
    update public.data_archive_runs run
    set status = 'failed',
        completed_at = coalesce(run.completed_at, now()),
        error_message = 'stale_archive_run_expired',
        request_metadata = coalesce(run.request_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'stale_recovery_at', now(),
            'stale_recovery_reason', 'no_live_archive_token',
            'stale_after_seconds', extract(epoch from p_stale_after)::bigint
          ),
        updated_at = now()
    where run.id in (select stale.id from stale)
    returning run.id
  )
  select count(*) into v_expired
  from expired;

  return jsonb_build_object(
    'status', 'ok',
    'expired_runs', v_expired,
    'checked_at', now()
  );
end;
$$;

revoke all on function private.expire_stale_historical_archive_runs(interval)
  from public, anon, authenticated;
grant execute on function private.expire_stale_historical_archive_runs(interval)
  to service_role;

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
  v_stale_cleanup jsonb;
  v_lock_acquired boolean;
begin
  v_lock_acquired := pg_try_advisory_xact_lock(
    hashtextextended('historical-excel-queue', 0)
  );

  if not v_lock_acquired then
    return jsonb_build_object(
      'status', 'deferred',
      'reason', 'queue_lock_busy',
      'checked_at', now()
    );
  end if;

  v_stale_cleanup := private.expire_stale_historical_archive_runs(
    interval '30 minutes'
  );

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

    if exists (
      select 1
      from public.data_archive_runs run
      where run.table_name = v_policy.table_name
        and coalesce(run.dataset_code, '*') = v_policy.dataset_code
        and run.status in ('queued', 'running', 'completed', 'verified')
        and run.cutoff_at >= v_cutoff - interval '1 day'
    ) then
      continue;
    end if;

    if v_policy.table_name = 'bronze_historical_records' then
      if v_policy.dataset_code = '*' then
        select exists (
          select 1
          from public.bronze_historical_records
          where ingested_at <= v_cutoff
        ) into v_has_rows;
      else
        select exists (
          select 1
          from public.bronze_historical_records
          where dataset_code = v_policy.dataset_code
            and ingested_at <= v_cutoff
        ) into v_has_rows;
      end if;
    elsif v_policy.table_name = 'capital_market_events' then
      if v_policy.dataset_code = '*' then
        select exists (
          select 1
          from public.capital_market_events
          where observed_at <= v_cutoff
            and (
              raw_payload <> '{}'::jsonb
              or normalized_payload <> '{}'::jsonb
            )
        ) into v_has_rows;
      else
        select exists (
          select 1
          from public.capital_market_events
          where dataset_code = v_policy.dataset_code
            and observed_at <= v_cutoff
            and (
              raw_payload <> '{}'::jsonb
              or normalized_payload <> '{}'::jsonb
            )
        ) into v_has_rows;
      end if;
    elsif v_policy.table_name = 'source_documents' then
      select exists (
        select 1
        from public.source_documents
        where observed_at <= v_cutoff
          and (
            raw_payload <> '{}'::jsonb
            or normalized_payload <> '{}'::jsonb
          )
      ) into v_has_rows;
    elsif v_policy.table_name = 'monitoring_outputs' then
      select exists (
        select 1
        from public.monitoring_outputs
        where observed_at <= v_cutoff
          and (
            raw_text is not null
            or payload <> '{}'::jsonb
            or output_payload <> '{}'::jsonb
            or normalized_payload <> '{}'::jsonb
          )
      ) into v_has_rows;
    end if;

    if not v_has_rows then
      continue;
    end if;

    v_chunk_rows := case
      when v_policy.table_name = 'capital_market_events' then 100
      when v_policy.table_name = 'bronze_historical_records'
           and v_policy.dataset_code = 'cvm_fund_registry' then 500
      when v_policy.table_name = 'bronze_historical_records' then 250
      else 500
    end;

    begin
      v_result := private.queue_historical_excel_export(
        p_table_name := v_policy.table_name,
        p_dataset_code := case
          when v_policy.dataset_code = '*' then null
          else v_policy.dataset_code
        end,
        p_cutoff := v_cutoff,
        p_include_raw_payload := true,
        p_chunk_rows := v_chunk_rows,
        p_requested_by := 'pg_cron:historical-excel-queue'
      );
    exception
      when lock_not_available or deadlock_detected
        or serialization_failure or query_canceled then
        return jsonb_build_object(
          'status', 'deferred',
          'reason', sqlstate,
          'message', sqlerrm,
          'table_name', v_policy.table_name,
          'dataset_code', v_policy.dataset_code,
          'cutoff_at', v_cutoff,
          'stale_cleanup', v_stale_cleanup,
          'checked_at', now()
        );
    end;

    return jsonb_build_object(
      'status', 'queued_one',
      'table_name', v_policy.table_name,
      'dataset_code', v_policy.dataset_code,
      'cutoff_at', v_cutoff,
      'result', v_result,
      'stale_cleanup', v_stale_cleanup
    );
  end loop;

  return jsonb_build_object(
    'status', 'nothing_due',
    'stale_cleanup', v_stale_cleanup,
    'checked_at', now()
  );
end;
$$;

revoke all on function private.queue_due_historical_excel_archives()
  from public, anon, authenticated;
grant execute on function private.queue_due_historical_excel_archives()
  to service_role;
