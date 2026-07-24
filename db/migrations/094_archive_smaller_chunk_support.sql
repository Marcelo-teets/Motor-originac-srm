alter table public.data_archive_runs
  drop constraint if exists data_archive_runs_chunk_rows_check;

alter table public.data_archive_runs
  add constraint data_archive_runs_chunk_rows_check
  check (chunk_rows between 100 and 25000);

create or replace function private.queue_historical_excel_export(
  p_table_name text,
  p_dataset_code text default null,
  p_cutoff timestamptz default now(),
  p_include_raw_payload boolean default true,
  p_chunk_rows integer default 1000,
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
  if not (p_table_name = any(v_allowed_tables)) then
    raise exception 'archive_table_not_allowed';
  end if;
  if p_chunk_rows < 100 or p_chunk_rows > 25000 then
    raise exception 'archive_chunk_rows_out_of_range';
  end if;
  if p_cutoff > now() + interval '1 minute' then
    raise exception 'archive_cutoff_in_future';
  end if;

  insert into public.data_archive_runs (
    table_name, dataset_code, cutoff_at, include_raw_payload,
    chunk_rows, status, requested_by, request_metadata
  )
  values (
    p_table_name, v_dataset_code, p_cutoff, p_include_raw_payload,
    p_chunk_rows, 'queued', nullif(trim(p_requested_by), ''),
    jsonb_build_object('queued_at', now(), 'source', 'private.queue_historical_excel_export')
  )
  returning id into v_run_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.data_archive_tokens (token_hash, expires_at, metadata)
  values (
    v_token_hash,
    v_expires_at,
    jsonb_build_object(
      'run_id', v_run_id,
      'table_name', p_table_name,
      'dataset_code', v_dataset_code,
      'cutoff_at', p_cutoff,
      'include_raw_payload', p_include_raw_payload,
      'chunk_rows', least(p_chunk_rows, 1000),
      'cursor', null,
      'part_number', 1
    )
  )
  returning id into v_token_id;

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
    'token_expires_at', v_expires_at,
    'chunk_rows', p_chunk_rows
  );
end;
$$;

revoke all on function private.queue_historical_excel_export(text, text, timestamptz, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function private.queue_historical_excel_export(text, text, timestamptz, boolean, integer, text)
  to service_role;
