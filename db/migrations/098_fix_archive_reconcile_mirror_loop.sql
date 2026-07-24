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
  select r.* into v_run
  from public.data_archive_runs r
  where r.status = 'completed'
     or (
       r.status = 'verified'
       and exists (
         select 1
         from public.data_archive_policies p
         where p.table_name = r.table_name
           and p.dataset_code in (coalesce(r.dataset_code, '*'), '*')
           and p.enabled
           and p.allow_prune
       )
     )
  order by r.created_at
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
      select * into v_run
      from public.data_archive_runs
      where id = v_run.id;
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
