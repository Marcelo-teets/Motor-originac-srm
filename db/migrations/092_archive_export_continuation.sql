create or replace function public.continue_historical_excel_export(
  p_run_id uuid,
  p_offset integer,
  p_part_number integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, net
as $$
declare
  v_run public.data_archive_runs%rowtype;
  v_token text;
  v_token_hash text;
  v_token_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
  v_request_id bigint;
begin
  select * into v_run
  from public.data_archive_runs
  where id = p_run_id;

  if v_run.id is null then raise exception 'archive_run_not_found'; end if;
  if v_run.status <> 'running' then raise exception 'archive_run_not_running'; end if;
  if p_offset < 0 or p_part_number < 1 then raise exception 'invalid_archive_continuation'; end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.data_archive_tokens (token_hash, expires_at, metadata)
  values (
    v_token_hash,
    v_expires_at,
    jsonb_build_object(
      'run_id', v_run.id,
      'table_name', v_run.table_name,
      'dataset_code', v_run.dataset_code,
      'cutoff_at', v_run.cutoff_at,
      'include_raw_payload', v_run.include_raw_payload,
      'chunk_rows', least(v_run.chunk_rows, 1000),
      'offset', p_offset,
      'part_number', p_part_number
    )
  )
  returning id into v_token_id;

  v_request_id := net.http_post(
    url := 'https://hdghpmssudrqhsbvrdyt.supabase.co/functions/v1/historical-excel-export',
    body := jsonb_build_object('runId', v_run.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json',
      'x-archive-token', v_token
    ),
    timeout_milliseconds := 120000
  );

  update public.data_archive_runs
  set request_metadata = jsonb_set(
        request_metadata,
        '{last_continuation}',
        jsonb_build_object(
          'pg_net_request_id', v_request_id,
          'token_id', v_token_id,
          'offset', p_offset,
          'part_number', p_part_number,
          'queued_at', now()
        ),
        true
      ),
      updated_at = now()
  where id = v_run.id;

  return jsonb_build_object(
    'status', 'continued',
    'run_id', v_run.id,
    'offset', p_offset,
    'part_number', p_part_number,
    'pg_net_request_id', v_request_id
  );
end;
$$;

revoke all on function public.continue_historical_excel_export(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.continue_historical_excel_export(uuid, integer, integer)
  to service_role;
