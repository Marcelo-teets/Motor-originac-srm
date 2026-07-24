-- Historical archive v2
-- 1) prevents payload-only rows from being exported more than once;
-- 2) keeps verification aligned with the exact exported population;
-- 3) schedules cleanup of failed workbook parts and stale one-time tokens.

create or replace view public.historical_archive_capital_market_events
with (security_invoker = true)
as
select *
from public.capital_market_events
where raw_payload <> '{}'::jsonb
   or normalized_payload <> '{}'::jsonb;

create or replace view public.historical_archive_source_documents
with (security_invoker = true)
as
select *
from public.source_documents
where raw_payload <> '{}'::jsonb
   or normalized_payload <> '{}'::jsonb;

create or replace view public.historical_archive_monitoring_outputs
with (security_invoker = true)
as
select *
from public.monitoring_outputs
where raw_text is not null
   or payload <> '{}'::jsonb
   or output_payload <> '{}'::jsonb
   or normalized_payload <> '{}'::jsonb;

revoke all on public.historical_archive_capital_market_events from public, anon, authenticated;
revoke all on public.historical_archive_source_documents from public, anon, authenticated;
revoke all on public.historical_archive_monitoring_outputs from public, anon, authenticated;
grant select on public.historical_archive_capital_market_events to service_role;
grant select on public.historical_archive_source_documents to service_role;
grant select on public.historical_archive_monitoring_outputs to service_role;

create index if not exists idx_data_archive_runs_failed_cleanup
  on public.data_archive_runs (completed_at, created_at)
  where status = 'failed';

create index if not exists idx_data_archive_tokens_stale
  on public.data_archive_tokens (expires_at, consumed_at);

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
    select count(*) into v_source_rows
    from public.capital_market_events
    where observed_at <= v_run.cutoff_at
      and (v_run.dataset_code is null or dataset_code = v_run.dataset_code)
      and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb);
  elsif v_run.table_name = 'bronze_historical_records' then
    select count(*) into v_source_rows
    from public.bronze_historical_records
    where ingested_at <= v_run.cutoff_at
      and (v_run.dataset_code is null or dataset_code = v_run.dataset_code);
  elsif v_run.table_name = 'source_documents' then
    select count(*) into v_source_rows
    from public.source_documents
    where observed_at <= v_run.cutoff_at
      and (raw_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb);
  elsif v_run.table_name = 'monitoring_outputs' then
    select count(*) into v_source_rows
    from public.monitoring_outputs
    where observed_at <= v_run.cutoff_at
      and (
        raw_text is not null or payload <> '{}'::jsonb or
        output_payload <> '{}'::jsonb or normalized_payload <> '{}'::jsonb
      );
  elsif v_run.table_name = 'company_signals' then
    select count(*) into v_source_rows
    from public.company_signals where observed_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'company_factor_observations' then
    select count(*) into v_source_rows
    from public.company_factor_observations where observed_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'score_snapshots' then
    select count(*) into v_source_rows
    from public.score_snapshots where created_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'qualification_snapshots' then
    select count(*) into v_source_rows
    from public.qualification_snapshots where created_at <= v_run.cutoff_at;
  elsif v_run.table_name = 'lead_score_snapshots' then
    select count(*) into v_source_rows
    from public.lead_score_snapshots where created_at <= v_run.cutoff_at;
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
        'source_rows_at_cutoff', v_source_rows,
        'eligibility_version', 2
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

create or replace function private.queue_historical_archive_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private, net
as $$
declare
  v_token text;
  v_token_hash text;
  v_token_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_request_id bigint;
begin
  if exists (
    select 1
    from public.data_archive_tokens
    where consumed_at is null
      and expires_at > now()
      and metadata ->> 'action' = 'cleanup_failed'
  ) then
    return jsonb_build_object('status', 'already_queued');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.data_archive_tokens (token_hash, expires_at, metadata)
  values (
    v_token_hash,
    v_expires_at,
    jsonb_build_object('action', 'cleanup_failed', 'queued_at', now())
  )
  returning id into v_token_id;

  v_request_id := net.http_post(
    url := 'https://hdghpmssudrqhsbvrdyt.supabase.co/functions/v1/historical-excel-catalog',
    body := jsonb_build_object('action', 'cleanup_failed'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json',
      'x-archive-token', v_token
    ),
    timeout_milliseconds := 120000
  );

  return jsonb_build_object(
    'status', 'queued',
    'token_id', v_token_id,
    'pg_net_request_id', v_request_id,
    'token_expires_at', v_expires_at
  );
end;
$$;

revoke all on function private.queue_historical_archive_maintenance()
  from public, anon, authenticated;
grant execute on function private.queue_historical_archive_maintenance()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'historical-excel-maintenance';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'historical-excel-maintenance',
  '20 6 * * *',
  $cron$select private.queue_historical_archive_maintenance();$cron$
);

comment on view public.historical_archive_capital_market_events is
  'Service-role-only export population. Excludes payloads already archived and cleared.';
comment on view public.historical_archive_source_documents is
  'Service-role-only export population. Excludes payloads already archived and cleared.';
comment on view public.historical_archive_monitoring_outputs is
  'Service-role-only export population. Excludes payloads already archived and cleared.';
