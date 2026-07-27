begin;

create or replace function private.queue_free_tier_archive_if_needed()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_health jsonb;
  v_state text;
  v_active integer;
  v_result jsonb;
begin
  v_health := private.capture_database_storage_snapshot();
  v_state := v_health ->> 'state';

  if v_state = 'healthy' then
    return jsonb_build_object('status', 'healthy', 'health', v_health);
  end if;

  select count(*) into v_active
  from public.data_archive_runs
  where status in ('queued', 'running', 'completed');

  if v_active > 0 then
    return jsonb_build_object(
      'status', 'archive_already_active',
      'active_runs', v_active,
      'health', v_health
    );
  end if;

  v_result := private.queue_due_historical_excel_archives();

  return jsonb_build_object(
    'status', 'archive_requested',
    'health', v_health,
    'archive', v_result
  );
end;
$$;

revoke all on function private.queue_free_tier_archive_if_needed()
  from public, anon, authenticated;
grant execute on function private.queue_free_tier_archive_if_needed() to service_role;

commit;
