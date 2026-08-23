begin;

-- Global Free-tier safety guard.
--
-- The repository already had a 400/425/450/475/500 MB budget policy, but only a
-- subset of GitHub workflows called the preflight RPC. This database-level guard
-- makes the policy source-agnostic: raw/heavy inserts are blocked at the warning
-- threshold regardless of whether they arrive from GitHub Actions, API routes,
-- Edge Functions, cron jobs, or manual ingestion.
--
-- It intentionally does not guard archive metadata tables and does not block
-- UPDATE/DELETE, so verified hot->cold archival and storage reduction remain
-- possible while the database is above the threshold.

create or replace function private.guard_free_tier_heavy_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_budget jsonb := private.storage_budget_state();
  v_state text := v_budget ->> 'state';
begin
  if v_state in ('warning', 'critical', 'emergency', 'quota_exceeded') then
    raise exception
      'free_tier_heavy_insert_blocked: table %, state %, database_mb %, target_mb %',
      tg_table_name,
      v_state,
      v_budget ->> 'database_mb',
      v_budget ->> 'target_mb'
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

revoke all on function private.guard_free_tier_heavy_insert()
  from public, anon, authenticated;
grant execute on function private.guard_free_tier_heavy_insert() to service_role;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'bronze_historical_records',
    'capital_market_events',
    'source_documents',
    'monitoring_outputs'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      v_trigger := 'trg_free_tier_heavy_insert_' || v_table;

      execute format(
        'drop trigger if exists %I on public.%I',
        v_trigger,
        v_table
      );

      execute format(
        'create trigger %I before insert on public.%I for each statement execute function private.guard_free_tier_heavy_insert()',
        v_trigger,
        v_table
      );
    end if;
  end loop;
end;
$$;

-- Keep the archive policy explicit about why these writes can be blocked.
update public.data_archive_policies
set notes = trim(
      coalesce(notes, '') ||
      ' Free-tier global guard: raw/heavy INSERTs are blocked from 425 MB upward; target active database size is 400 MB.'
    ),
    updated_at = now()
where resource_name in (
  'bronze_historical_records',
  'capital_market_events',
  'source_documents',
  'monitoring_outputs'
)
  and position('Free-tier global guard:' in coalesce(notes, '')) = 0;

commit;
