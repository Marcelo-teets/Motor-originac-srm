-- Neon-native database growth circuit breaker for Motor Originação.
-- Target: Neon project steep-poetry-38942951 (production branch).
-- Provider logical-size quota observed on 2026-10-01: 480,000,000 bytes.
--
-- Safety properties:
-- - non-destructive install;
-- - decision-critical analytical tables remain writable;
-- - only future growth on raw/heavy tables is bounded;
-- - shrinking UPDATEs remain allowed for archive/cleanup;
-- - no Supabase-only roles or objects are referenced.

begin;

create extension if not exists pg_cron;

create schema if not exists private;

create table if not exists private.database_growth_guard_state (
  singleton boolean primary key default true check (singleton),
  soft_limit_bytes bigint not null check (soft_limit_bytes > 0),
  hard_limit_bytes bigint not null check (hard_limit_bytes > soft_limit_bytes),
  degraded_max_row_bytes integer not null default 262144
    check (degraded_max_row_bytes between 16384 and 4194304),
  current_bytes bigint,
  status text not null default 'unknown'
    check (status in ('unknown','normal','degraded','block_raw')),
  checked_at timestamptz,
  reason text,
  updated_at timestamptz not null default now()
);

revoke all on schema private from public, anonymous, authenticated;
revoke all on table private.database_growth_guard_state from public, anonymous, authenticated;
grant usage on schema private to neondb_owner;
grant select, insert, update on table private.database_growth_guard_state to neondb_owner;

insert into private.database_growth_guard_state (
  singleton,
  soft_limit_bytes,
  hard_limit_bytes,
  degraded_max_row_bytes,
  status,
  reason
)
values (
  true,
  400000000,
  440000000,
  262144,
  'unknown',
  'Neon free-plan guard: 400MB soft / 440MB hard against observed 480MB logical-size quota.'
)
on conflict (singleton) do update set
  soft_limit_bytes = excluded.soft_limit_bytes,
  hard_limit_bytes = excluded.hard_limit_bytes,
  degraded_max_row_bytes = excluded.degraded_max_row_bytes,
  updated_at = now();

create or replace function private.refresh_database_growth_guard()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_state private.database_growth_guard_state%rowtype;
  v_bytes bigint;
  v_status text;
  v_reason text;
begin
  select * into v_state
  from private.database_growth_guard_state
  where singleton = true
  for update;

  if v_state.singleton is null then
    raise exception 'database_growth_guard_not_configured';
  end if;

  v_bytes := pg_database_size(current_database());

  if v_bytes >= v_state.hard_limit_bytes then
    v_status := 'block_raw';
    v_reason := 'Database is at or above the hard limit; raw/heavy growth is blocked.';
  elsif v_bytes >= v_state.soft_limit_bytes then
    v_status := 'degraded';
    v_reason := 'Database is above the soft limit; oversized raw rows are blocked.';
  else
    v_status := 'normal';
    v_reason := 'Database is below the configured soft limit.';
  end if;

  update private.database_growth_guard_state
  set current_bytes = v_bytes,
      status = v_status,
      checked_at = now(),
      reason = v_reason,
      updated_at = now()
  where singleton = true;

  return jsonb_build_object(
    'status', v_status,
    'current_bytes', v_bytes,
    'soft_limit_bytes', v_state.soft_limit_bytes,
    'hard_limit_bytes', v_state.hard_limit_bytes,
    'degraded_max_row_bytes', v_state.degraded_max_row_bytes,
    'checked_at', now()
  );
end;
$$;

revoke all on function private.refresh_database_growth_guard()
  from public, anonymous, authenticated;
grant execute on function private.refresh_database_growth_guard()
  to neondb_owner;

create or replace function private.configure_database_growth_guard(
  p_soft_limit_bytes bigint,
  p_hard_limit_bytes bigint,
  p_degraded_max_row_bytes integer default 262144
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_soft_limit_bytes <= 0
     or p_hard_limit_bytes <= p_soft_limit_bytes
     or p_hard_limit_bytes >= 480000000
     or p_degraded_max_row_bytes < 16384
     or p_degraded_max_row_bytes > 4194304 then
    raise exception 'invalid_database_growth_guard_configuration';
  end if;

  update private.database_growth_guard_state
  set soft_limit_bytes = p_soft_limit_bytes,
      hard_limit_bytes = p_hard_limit_bytes,
      degraded_max_row_bytes = p_degraded_max_row_bytes,
      status = 'unknown',
      checked_at = null,
      reason = 'Limits updated; refresh pending.',
      updated_at = now()
  where singleton = true;

  return private.refresh_database_growth_guard();
end;
$$;

revoke all on function private.configure_database_growth_guard(bigint, bigint, integer)
  from public, anonymous, authenticated;
grant execute on function private.configure_database_growth_guard(bigint, bigint, integer)
  to neondb_owner;

create or replace function private.guard_heavy_table_growth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_state private.database_growth_guard_state%rowtype;
  v_new_bytes integer;
  v_old_bytes integer := 0;
begin
  select * into v_state
  from private.database_growth_guard_state
  where singleton = true;

  if v_state.singleton is null then
    return new;
  end if;

  if v_state.checked_at is null or v_state.checked_at < now() - interval '30 minutes' then
    perform private.refresh_database_growth_guard();
    select * into v_state
    from private.database_growth_guard_state
    where singleton = true;
  end if;

  v_new_bytes := pg_column_size(to_jsonb(new));

  if tg_op = 'UPDATE' then
    v_old_bytes := pg_column_size(to_jsonb(old));
  end if;

  if tg_op = 'UPDATE' and v_new_bytes <= v_old_bytes then
    return new;
  end if;

  if v_state.status = 'block_raw' then
    raise exception using
      errcode = '53100',
      message = 'database_growth_guard_block_raw',
      detail = format(
        'table=%I.%I current_bytes=%s hard_limit_bytes=%s attempted_row_bytes=%s',
        tg_table_schema, tg_table_name, v_state.current_bytes,
        v_state.hard_limit_bytes, v_new_bytes
      ),
      hint = 'Archive or reduce raw payloads before resuming ingestion.';
  end if;

  if v_state.status = 'degraded'
     and v_new_bytes > v_state.degraded_max_row_bytes then
    raise exception using
      errcode = '53100',
      message = 'database_growth_guard_oversized_raw_row',
      detail = format(
        'table=%I.%I current_bytes=%s soft_limit_bytes=%s attempted_row_bytes=%s row_limit_bytes=%s',
        tg_table_schema, tg_table_name, v_state.current_bytes,
        v_state.soft_limit_bytes, v_new_bytes, v_state.degraded_max_row_bytes
      ),
      hint = 'Reduce raw payload size or externalize the source artifact before retrying.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_heavy_table_growth()
  from public, anonymous, authenticated;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'monitoring_outputs',
    'source_documents',
    'capital_market_events',
    'bronze_historical_records'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      v_trigger := 'trg_database_growth_guard_' || v_table;
      execute format('drop trigger if exists %I on public.%I', v_trigger, v_table);
      execute format(
        'create trigger %I before insert or update on public.%I for each row execute function private.guard_heavy_table_growth()',
        v_trigger,
        v_table
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'database-growth-guard-refresh'
  limit 1;

  if v_job_id is null then
    perform cron.schedule(
      'database-growth-guard-refresh',
      '11,41 * * * *',
      $cron$select private.refresh_database_growth_guard();$cron$
    );
  else
    perform cron.alter_job(
      v_job_id,
      schedule := '11,41 * * * *',
      command := 'select private.refresh_database_growth_guard();',
      active := true
    );
  end if;
end;
$$;

select private.refresh_database_growth_guard();

commit;
