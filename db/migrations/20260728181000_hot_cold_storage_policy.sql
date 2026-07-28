begin;

alter table public.database_storage_snapshots
  add column if not exists emergency_bytes bigint not null default 498073600;

alter table public.database_storage_snapshots
  drop constraint if exists database_storage_snapshots_state_check;

alter table public.database_storage_snapshots
  add constraint database_storage_snapshots_state_check
  check (state in ('healthy', 'preventive', 'warning', 'critical', 'emergency', 'quota_exceeded'));

create or replace function private.storage_budget_state(p_database_bytes bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_database_bytes bigint := coalesce(p_database_bytes, pg_database_size(current_database()));
  v_state text;
  v_allowed_rows integer;
begin
  v_state := case
    when v_database_bytes >= 524288000 then 'quota_exceeded'
    when v_database_bytes >= 498073600 then 'emergency'
    when v_database_bytes >= 471859200 then 'critical'
    when v_database_bytes >= 445644800 then 'warning'
    when v_database_bytes >= 419430400 then 'preventive'
    else 'healthy'
  end;

  v_allowed_rows := case
    when v_state = 'healthy' then 20000
    when v_state = 'preventive' then 5000
    when v_state = 'warning' then 500
    when v_state = 'critical' then 100
    else 0
  end;

  return jsonb_build_object(
    'state', v_state,
    'database_bytes', v_database_bytes,
    'database_mb', round(v_database_bytes / 1024.0 / 1024.0, 2),
    'allowed_rows', v_allowed_rows,
    'target_mb', 400,
    'warning_mb', 425,
    'critical_mb', 450,
    'emergency_mb', 475,
    'free_quota_mb', 500,
    'archive_strategy', 'supabase_hot_google_sheets_cold'
  );
end;
$$;

revoke all on function private.storage_budget_state(bigint) from public, anon, authenticated;
grant execute on function private.storage_budget_state(bigint) to service_role;

create or replace function private.capture_database_storage_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_budget jsonb := private.storage_budget_state();
  v_id bigint;
begin
  insert into public.database_storage_snapshots (
    database_bytes,
    target_bytes,
    warning_bytes,
    critical_bytes,
    emergency_bytes,
    free_quota_bytes,
    state,
    metadata
  ) values (
    (v_budget ->> 'database_bytes')::bigint,
    419430400,
    445644800,
    471859200,
    498073600,
    524288000,
    v_budget ->> 'state',
    v_budget
  ) returning id into v_id;

  return v_budget || jsonb_build_object('snapshot_id', v_id, 'captured_at', now());
end;
$$;

revoke all on function private.capture_database_storage_snapshot() from public, anon, authenticated;
grant execute on function private.capture_database_storage_snapshot() to service_role;

create or replace function public.assert_ingestion_storage_budget(
  p_operation text,
  p_requested_rows integer default 0,
  p_trigger_type text default 'manual'
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_budget jsonb := private.storage_budget_state();
  v_state text := v_budget ->> 'state';
  v_allowed_rows integer := (v_budget ->> 'allowed_rows')::integer;
begin
  if p_trigger_type = 'backfill' and v_state <> 'healthy' then
    raise exception 'storage_budget_blocks_backfill: state %, database_mb %',
      v_state, v_budget ->> 'database_mb'
      using errcode = 'P0001';
  end if;

  if greatest(coalesce(p_requested_rows, 0), 0) > v_allowed_rows then
    raise exception 'storage_budget_row_limit: state %, requested %, allowed %, database_mb %',
      v_state, p_requested_rows, v_allowed_rows, v_budget ->> 'database_mb'
      using errcode = 'P0001';
  end if;

  return v_budget || jsonb_build_object(
    'allowed', true,
    'operation', coalesce(nullif(trim(p_operation), ''), 'unknown'),
    'trigger_type', p_trigger_type,
    'requested_rows', greatest(coalesce(p_requested_rows, 0), 0)
  );
end;
$$;

revoke all on function public.assert_ingestion_storage_budget(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.assert_ingestion_storage_budget(text, integer, text)
  to service_role;

create or replace function private.guard_capital_market_ingestion_budget()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_requested_rows integer := greatest(coalesce((new.metadata ->> 'maxRows')::integer, 0), 0);
begin
  perform public.assert_ingestion_storage_budget(
    'capital_market_ingestion:' || coalesce(new.dataset_code, 'unknown'),
    v_requested_rows,
    coalesce(new.trigger_type, 'manual')
  );
  return new;
end;
$$;

revoke all on function private.guard_capital_market_ingestion_budget()
  from public, anon, authenticated;
grant execute on function private.guard_capital_market_ingestion_budget() to service_role;

drop trigger if exists trg_capital_market_ingestion_storage_budget
  on public.capital_market_dataset_runs;
create trigger trg_capital_market_ingestion_storage_budget
before insert on public.capital_market_dataset_runs
for each row
when (new.status = 'running')
execute function private.guard_capital_market_ingestion_budget();

drop view if exists public.database_storage_health_v1;
create view public.database_storage_health_v1
with (security_invoker = true)
as
select
  id,
  database_bytes,
  round(database_bytes / 1024.0 / 1024.0, 2) as database_mb,
  target_bytes,
  warning_bytes,
  critical_bytes,
  free_quota_bytes,
  state,
  metadata,
  captured_at,
  emergency_bytes
from public.database_storage_snapshots
order by captured_at desc
limit 1;

revoke all on table public.database_storage_health_v1 from public, anon, authenticated;
grant select on table public.database_storage_health_v1 to service_role;

update public.data_archive_policies
set notes = notes || ' General strategy: newest operational data remains in Supabase; older or heavy data moves to Google Drive/Sheets.',
    updated_at = now()
where enabled
  and notes not like '%General strategy: newest operational data remains in Supabase%';

select private.capture_database_storage_snapshot();

commit;