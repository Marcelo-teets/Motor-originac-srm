begin;

alter table public.database_storage_snapshots add column if not exists emergency_bytes bigint not null default 498073600;
alter table public.database_storage_snapshots drop constraint if exists database_storage_snapshots_state_check;
alter table public.database_storage_snapshots add constraint database_storage_snapshots_state_check check (state in ('healthy','preventive','warning','critical','emergency','quota_exceeded'));

create or replace function private.capture_database_storage_snapshot()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_database_bytes bigint:=pg_database_size(current_database());
  v_target_bytes constant bigint:=419430400;
  v_warning_bytes constant bigint:=445644800;
  v_critical_bytes constant bigint:=471859200;
  v_emergency_bytes constant bigint:=498073600;
  v_quota_bytes constant bigint:=524288000;
  v_state text; v_id bigint;
begin
  v_state:=case when v_database_bytes>=v_quota_bytes then 'quota_exceeded' when v_database_bytes>=v_emergency_bytes then 'emergency' when v_database_bytes>=v_critical_bytes then 'critical' when v_database_bytes>=v_warning_bytes then 'warning' when v_database_bytes>=v_target_bytes then 'preventive' else 'healthy' end;
  insert into public.database_storage_snapshots(database_bytes,target_bytes,warning_bytes,critical_bytes,emergency_bytes,free_quota_bytes,state,metadata)
  values(v_database_bytes,v_target_bytes,v_warning_bytes,v_critical_bytes,v_emergency_bytes,v_quota_bytes,v_state,jsonb_build_object('database_mb',round(v_database_bytes/1024.0/1024.0,2),'target_mb',400,'warning_mb',425,'critical_mb',450,'emergency_mb',475,'free_quota_mb',500,'strategy','supabase_hot_google_sheets_cold')) returning id into v_id;
  return jsonb_build_object('snapshot_id',v_id,'database_bytes',v_database_bytes,'database_mb',round(v_database_bytes/1024.0/1024.0,2),'state',v_state,'target_bytes',v_target_bytes,'warning_bytes',v_warning_bytes,'critical_bytes',v_critical_bytes,'emergency_bytes',v_emergency_bytes,'free_quota_bytes',v_quota_bytes,'captured_at',now());
end $$;
revoke all on function private.capture_database_storage_snapshot() from public,anon,authenticated;
grant execute on function private.capture_database_storage_snapshot() to service_role;

create or replace function public.assert_ingestion_storage_budget(p_operation text,p_requested_rows integer default 0,p_trigger_type text default 'manual')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
  v_database_bytes bigint:=pg_database_size(current_database());
  v_state text; v_allowed_rows integer;
begin
  v_state:=case when v_database_bytes>=524288000 then 'quota_exceeded' when v_database_bytes>=498073600 then 'emergency' when v_database_bytes>=471859200 then 'critical' when v_database_bytes>=445644800 then 'warning' when v_database_bytes>=419430400 then 'preventive' else 'healthy' end;
  v_allowed_rows:=case when v_state='healthy' then 20000 when v_state='preventive' then 5000 when v_state='warning' then 500 when v_state='critical' then 100 else 0 end;
  if p_trigger_type='backfill' and v_state<>'healthy' then raise exception 'storage_budget_blocks_backfill: state %, database_mb %',v_state,round(v_database_bytes/1024.0/1024.0,2) using errcode='P0001'; end if;
  if greatest(coalesce(p_requested_rows,0),0)>v_allowed_rows then raise exception 'storage_budget_row_limit: state %, requested %, allowed %, database_mb %',v_state,p_requested_rows,v_allowed_rows,round(v_database_bytes/1024.0/1024.0,2) using errcode='P0001'; end if;
  return jsonb_build_object('allowed',true,'operation',coalesce(nullif(trim(p_operation),''),'unknown'),'trigger_type',p_trigger_type,'requested_rows',greatest(coalesce(p_requested_rows,0),0),'allowed_rows',v_allowed_rows,'state',v_state,'database_mb',round(v_database_bytes/1024.0/1024.0,2),'archive_strategy','supabase_hot_google_sheets_cold');
end $$;
revoke all on function public.assert_ingestion_storage_budget(text,integer,text) from public,anon,authenticated;
grant execute on function public.assert_ingestion_storage_budget(text,integer,text) to service_role;

create or replace view public.database_storage_health_v1 with (security_invoker=true) as
select id,database_bytes,round(database_bytes/1024.0/1024.0,2) as database_mb,target_bytes,warning_bytes,critical_bytes,emergency_bytes,free_quota_bytes,state,metadata,captured_at
from public.database_storage_snapshots order by captured_at desc limit 1;
revoke all on table public.database_storage_health_v1 from public,anon,authenticated;
grant select on table public.database_storage_health_v1 to service_role;

update public.data_archive_policies set notes=notes||' General strategy: newest operational data remains in Supabase; older or heavy data moves to Google Drive/Sheets.',updated_at=now() where enabled and notes not like '%General strategy: newest operational data remains in Supabase%';
select private.capture_database_storage_snapshot();
commit;