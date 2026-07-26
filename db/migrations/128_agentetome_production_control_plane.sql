-- Agentetome production control plane.
-- Centralizes provider authentication in Supabase Vault, makes refreshes scheduled
-- and observable, guarantees bronze -> silver promotion, and exposes a service-role
-- runtime contract without persisting raw XML or temporary provider download URLs.

create table if not exists public.agentetome_export_targets (
  id uuid primary key default gen_random_uuid(),
  administrator text not null,
  administrator_cnpj text,
  active boolean not null default true,
  cut text not null default 'recente' check (cut in ('recente','competencia')),
  competence text,
  format text not null default 'csv' check (format in ('csv','xlsx')),
  cadence_hours integer not null default 24 check (cadence_hours between 1 and 720),
  priority integer not null default 100,
  next_run_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_queued_at timestamptz,
  last_success_at timestamptz,
  last_status text not null default 'never' check (last_status in ('never','queued','completed','failed','blocked')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cut <> 'competencia' or competence ~ '^\d{4}-\d{2}$')
);

create unique index if not exists agentetome_export_targets_admin_uidx
  on public.agentetome_export_targets (lower(administrator));
create index if not exists agentetome_export_targets_due_idx
  on public.agentetome_export_targets (active,next_run_at,priority)
  where active;

alter table public.agentetome_export_targets enable row level security;
revoke all on table public.agentetome_export_targets from public,anon,authenticated;
grant select,insert,update,delete on table public.agentetome_export_targets to service_role;
drop policy if exists agentetome_export_targets_service_role_all on public.agentetome_export_targets;
create policy agentetome_export_targets_service_role_all
  on public.agentetome_export_targets
  for all to service_role
  using (true) with check (true);

insert into public.agentetome_export_targets (
  administrator,administrator_cnpj,active,cut,format,cadence_hours,priority,next_run_at,metadata
)
select
  'oliveira trust','36113876000191',true,'recente','csv',24,1,now(),
  jsonb_build_object(
    'provider','agentetome',
    'purpose','FIDC/FII/555 administrator export',
    'officialUnderlyingSources',jsonb_build_array('CVM','FNET')
  )
where not exists (
  select 1 from public.agentetome_export_targets
  where lower(administrator)=lower('oliveira trust')
);

create or replace function public.get_agentetome_runtime_secret()
returns text
language sql
security definer
set search_path = pg_catalog,vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name='agentetome_api_key'
  limit 1
$$;

comment on function public.get_agentetome_runtime_secret() is
  'Returns the Agentetome API key only to service_role runtimes. Never expose this RPC to browser roles.';
revoke all on function public.get_agentetome_runtime_secret() from public,anon,authenticated;
grant execute on function public.get_agentetome_runtime_secret() to service_role;

create or replace function public.record_agentetome_validation_audit(
  p_requested_by uuid,
  p_status text,
  p_http_status integer,
  p_duration_ms integer,
  p_request_fingerprint text,
  p_response_summary jsonb,
  p_retry_after_seconds integer default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog,public
as $$
declare
  v_source_id uuid;
  v_id uuid;
begin
  if p_status not in ('completed','partial','failed','blocked') then
    raise exception 'invalid_agentetome_run_status';
  end if;

  select id into v_source_id
  from public.source_catalog
  where metadata->>'code'='src_agentetome_api'
  limit 1;

  insert into public.agentetome_operation_runs (
    source_id,requested_by,operation,status,request_fingerprint,response_summary,
    http_status,retry_after_seconds,duration_ms
  ) values (
    v_source_id,p_requested_by,'validate_fidc_xml',p_status,p_request_fingerprint,
    coalesce(p_response_summary,'{}'::jsonb),p_http_status,p_retry_after_seconds,
    greatest(0,coalesce(p_duration_ms,0))
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_agentetome_validation_audit(uuid,text,integer,integer,text,jsonb,integer)
  from public,anon,authenticated;
grant execute on function public.record_agentetome_validation_audit(uuid,text,integer,integer,text,jsonb,integer)
  to service_role;

create or replace function public.agentetome_admin_manifest_secure(
  p_admin text default 'oliveira trust',
  p_cut text default 'recente',
  p_competence text default null,
  p_requested_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_source_id uuid;
  v_result jsonb;
  v_http_status integer;
  v_duration_ms integer;
  v_ok boolean;
  v_started_at timestamptz := clock_timestamp();
begin
  select id into v_source_id
  from public.source_catalog
  where metadata->>'code'='src_agentetome_api'
  limit 1;

  begin
    v_result := private.probe_agentetome_admin_manifest(p_admin,p_cut,p_competence);
    v_http_status := coalesce((v_result->>'http_status')::integer,502);
    v_duration_ms := coalesce((v_result->>'duration_ms')::integer,
      floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer);
    v_ok := v_http_status between 200 and 299
      and coalesce((v_result#>>'{payload,schema_versao}')::integer,0)=1;

    insert into public.agentetome_operation_runs (
      source_id,requested_by,operation,status,administrator,competence,
      request_fingerprint,response_summary,http_status,duration_ms
    ) values (
      v_source_id,p_requested_by,'admin_manifest',case when v_ok then 'completed' else 'failed' end,
      trim(p_admin),p_competence,
      encode(extensions.digest(jsonb_build_object(
        'administrator',trim(p_admin),'cut',p_cut,'competence',p_competence
      )::text,'sha256'),'hex'),
      jsonb_build_object(
        'schema_version',v_result#>>'{payload,schema_versao}',
        'filter',coalesce(v_result#>'{payload,filtro}','{}'::jsonb),
        'files',coalesce(v_result#>'{payload,arquivos}','{}'::jsonb),
        'provider_error',not v_ok,
        'raw_download_link_persisted',false
      ),v_http_status,v_duration_ms
    );

    return v_result || jsonb_build_object('provider_error',not v_ok);
  exception when others then
    v_duration_ms := floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer;
    insert into public.agentetome_operation_runs (
      source_id,requested_by,operation,status,administrator,competence,
      response_summary,http_status,duration_ms
    ) values (
      v_source_id,p_requested_by,'admin_manifest','failed',trim(p_admin),p_competence,
      jsonb_build_object('error',sqlerrm,'raw_download_link_persisted',false),502,v_duration_ms
    );
    return jsonb_build_object(
      'provider','agentetome','operation','admin_manifest','provider_error',true,
      'http_status',502,'duration_ms',v_duration_ms,'error',sqlerrm
    );
  end;
end;
$$;
revoke all on function public.agentetome_admin_manifest_secure(text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.agentetome_admin_manifest_secure(text,text,text,uuid)
  to service_role;

create or replace function public.agentetome_runtime_status()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,vault,cron
as $$
declare
  v_source public.source_catalog%rowtype;
  v_secret_configured boolean;
  v_active_targets integer;
  v_parsed_packages integer;
  v_failed_packages integer;
  v_bronze_rows bigint;
  v_fidc_events integer;
  v_last_package_at timestamptz;
  v_last_check_at timestamptz;
  v_last_success_at timestamptz;
  v_latest_reference_date date;
  v_latest_observed_at timestamptz;
  v_cron_active boolean;
  v_ready boolean;
  v_fresh boolean;
  v_blockers jsonb := '[]'::jsonb;
begin
  select * into v_source
  from public.source_catalog
  where metadata->>'code'='src_agentetome_api'
  limit 1;

  select exists(
    select 1 from vault.decrypted_secrets
    where name='agentetome_api_key' and nullif(decrypted_secret,'') is not null
  ) into v_secret_configured;

  select count(*) filter (where active),max(last_success_at)
  into v_active_targets,v_last_success_at
  from public.agentetome_export_targets;

  select count(*) filter (where status='parsed'),count(*) filter (where status='failed'),max(updated_at)
  into v_parsed_packages,v_failed_packages,v_last_package_at
  from public.agentetome_export_packages;

  select count(*)::bigint into v_bronze_rows
  from public.bronze_historical_records
  where dataset_code like 'agentetome\_%' escape '\';

  select count(*)::integer,max(reference_date),max(observed_at)
  into v_fidc_events,v_latest_reference_date,v_latest_observed_at
  from public.capital_market_events
  where dataset_code='agentetome_fidc_consolidado_v1'
    and source_code='src_agentetome_api';

  select max(finished_at) filter (where status='completed')
  into v_last_check_at
  from public.source_connector_runs
  where source_id=v_source.id;

  v_last_success_at := greatest(v_last_success_at,v_last_check_at);

  select exists(
    select 1 from cron.job
    where jobname='agentetome-due-export-refresh' and active
  ) into v_cron_active;

  if not v_secret_configured then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','secret_missing','title','Chave do Agentetome ausente no Vault',
      'nextAction','Cadastrar agentetome_api_key no Supabase Vault.'
    ));
  end if;
  if v_active_targets=0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','no_active_target','title','Nenhuma administradora ativa',
      'nextAction','Ativar ao menos um registro em agentetome_export_targets.'
    ));
  end if;
  if v_parsed_packages=0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','no_parsed_package','title','Nenhum pacote validado',
      'nextAction','Executar uma ingestão real por administradora.'
    ));
  end if;
  if v_fidc_events=0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','no_fidc_events','title','Silver FIDC vazio',
      'nextAction','Sincronizar bronze Agentetome para capital_market_events.'
    ));
  end if;
  if not v_cron_active then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','cron_inactive','title','Refresh automático inativo',
      'nextAction','Ativar o job agentetome-due-export-refresh.'
    ));
  end if;

  v_ready := v_secret_configured and v_active_targets>0 and v_parsed_packages>0
    and v_fidc_events>0 and v_cron_active;
  v_fresh := v_last_check_at is not null and v_last_check_at >= now()-interval '36 hours';

  if v_ready and not v_fresh then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code','refresh_stale','title','Última verificação acima de 36 horas',
      'nextAction','Executar refresh manual ou validar o worker agendado.'
    ));
  end if;

  return jsonb_build_object(
    'provider','agentetome',
    'sourceCode','src_agentetome_api',
    'status',case when v_ready then 'real' else 'partial' end,
    'health',case when v_ready and v_fresh then 'healthy' else 'degraded' end,
    'configured',v_secret_configured,
    'secretMode','supabase_vault',
    'automaticRefresh',v_cron_active,
    'activeTargets',v_active_targets,
    'parsedPackages',v_parsed_packages,
    'failedPackages',v_failed_packages,
    'bronzeRows',v_bronze_rows,
    'fidcEvents',v_fidc_events,
    'lastPackageAt',v_last_package_at,
    'lastCheckAt',v_last_check_at,
    'lastSuccessAt',v_last_success_at,
    'latestReferenceDate',v_latest_reference_date,
    'latestObservedAt',v_latest_observed_at,
    'marketMapReady',v_fidc_events>0,
    'scoreImpact',false,
    'capabilities',jsonb_build_array(
      'validate_fidc_xml','admin_manifest','admin_export_ingestion','fidc_market_map'
    ),
    'edgeFunctions',jsonb_build_object(
      'ingest','agentetome-ingest-export-v4',
      'recovery','agentetome-recover-package-v2',
      'xmlValidation','agentetome-validate-xml-v1'
    ),
    'blockers',v_blockers,
    'generatedAt',now()
  );
end;
$$;
revoke all on function public.agentetome_runtime_status() from public,anon,authenticated;
grant execute on function public.agentetome_runtime_status() to service_role;

create or replace function private.refresh_agentetome_source_status()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_status jsonb;
begin
  v_status := public.agentetome_runtime_status();

  update public.source_catalog
  set
    frequency='hourly_control_daily_export',
    status=v_status->>'status',
    health=v_status->>'health',
    metadata=(metadata
      - 'marketMapVercelStatus'
      - 'vercelBuildChannelStatus'
      - 'marketMapProductStatus'
      - 'implementationPhase'
      - 'downstreamPhase'
      - 'runtimeChannels') || jsonb_build_object(
        'implementationPhase','production_operational',
        'downstreamPhase','scheduled_export_bronze_silver_market_map',
        'implementedRuntime',true,
        'runtimeCodeReady',true,
        'supabaseRuntimeStatus',v_status->>'status',
        'runtimeChannels',jsonb_build_object(
          'vercelApi','supabase_vault_proxy',
          'supabaseIngestion','real',
          'supabaseXmlValidation','real'
        ),
        'automaticRefresh',coalesce((v_status->>'automaticRefresh')::boolean,false),
        'activeTargets',coalesce((v_status->>'activeTargets')::integer,0),
        'parsedPackages',coalesce((v_status->>'parsedPackages')::integer,0),
        'bronzeRowsAvailable',coalesce((v_status->>'bronzeRows')::bigint,0),
        'fidcMarketEventsAvailable',coalesce((v_status->>'fidcEvents')::integer,0),
        'lastSuccessfulExportAt',v_status->>'lastSuccessAt',
        'latestReferenceDate',v_status->>'latestReferenceDate',
        'automaticScoreImpact',false,
        'marketMapScoreImpact',false,
        'runtimeStatusValidatedAt',now()
      ),
    updated_at=now()
  where metadata->>'code'='src_agentetome_api';

  return v_status;
end;
$$;
revoke all on function private.refresh_agentetome_source_status() from public,anon,authenticated;
grant execute on function private.refresh_agentetome_source_status() to service_role;

create or replace function public.record_agentetome_target_failure(
  p_administrator text,
  p_error text,
  p_runtime text default 'agentetome-ingest-export-v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
begin
  update public.agentetome_export_targets
  set
    last_attempt_at=now(),
    last_status='failed',
    consecutive_failures=consecutive_failures+1,
    last_error=left(coalesce(p_error,'unknown_error'),900),
    next_run_at=now()+least(interval '6 hours',interval '1 hour'*(consecutive_failures+1)),
    metadata=metadata||jsonb_build_object('lastRuntime',p_runtime,'lastFailureAt',now()),
    updated_at=now()
  where lower(administrator)=lower(trim(p_administrator));

  update public.source_catalog
  set health='degraded',metadata=metadata||jsonb_build_object(
    'lastRuntimeError',left(coalesce(p_error,'unknown_error'),900),
    'lastRuntimeErrorAt',now()
  ),updated_at=now()
  where metadata->>'code'='src_agentetome_api';

  return jsonb_build_object('status','recorded','administrator',trim(p_administrator));
end;
$$;
revoke all on function public.record_agentetome_target_failure(text,text,text)
  from public,anon,authenticated;
grant execute on function public.record_agentetome_target_failure(text,text,text)
  to service_role;

create or replace function public.refresh_agentetome_existing_package(
  p_package_hash text,
  p_runtime text default 'agentetome-ingest-export-v4',
  p_trigger_type text default 'idempotent_refresh'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private,extensions
as $$
declare
  v_package public.agentetome_export_packages%rowtype;
  v_source_id uuid;
  v_connector_run_id uuid := gen_random_uuid();
  v_operation_run_id uuid;
  v_rows integer := 0;
  v_silver jsonb;
  v_runtime_status jsonb;
begin
  select * into v_package
  from public.agentetome_export_packages
  where content_hash=p_package_hash and status='parsed'
  limit 1;
  if not found then raise exception 'agentetome_parsed_package_not_found'; end if;

  v_source_id := v_package.source_id;
  select coalesce(sum(value::integer),0) into v_rows
  from jsonb_each_text(coalesce(v_package.row_counts,'{}'::jsonb));

  v_silver := private.sync_agentetome_fidc_market_events(v_package.content_hash);

  insert into public.source_connector_runs (
    id,company_id,source_id,scope_type,trigger_type,status,started_at,finished_at,
    items_collected,outputs_written,signals_written,enrichments_written,error_message,metadata
  ) values (
    v_connector_run_id,null,v_source_id,'administrator',p_trigger_type,'completed',now(),now(),
    v_rows,v_package.file_count+1,0,0,null,jsonb_build_object(
      'source_code','src_agentetome_api','administrator',v_package.administrator,
      'package_hash',v_package.content_hash,'mode','idempotent_existing_package','runtime',p_runtime
    )
  );

  insert into public.agentetome_operation_runs (
    source_id,operation,status,administrator,competence,format,request_fingerprint,
    response_summary,http_status,duration_ms
  ) values (
    v_source_id,'admin_export','completed',v_package.administrator,v_package.competence,v_package.format,
    encode(extensions.digest(jsonb_build_object(
      'administrator',v_package.administrator,'package_hash',v_package.content_hash,'mode','idempotent'
    )::text,'sha256'),'hex'),
    jsonb_build_object(
      'package_id',v_package.id,'package_hash',v_package.content_hash,
      'mode','idempotent_existing_package','row_counts',v_package.row_counts,
      'silver',v_silver,'raw_download_link_persisted',false,'runtime',p_runtime
    ),200,0
  ) returning id into v_operation_run_id;

  update public.agentetome_export_packages
  set metadata=metadata||jsonb_build_object(
    'last_checked_at',now(),'last_check_mode','idempotent_existing_package',
    'last_check_runtime',p_runtime,'last_operation_run_id',v_operation_run_id
  ),updated_at=now()
  where id=v_package.id;

  update public.agentetome_export_targets
  set
    last_attempt_at=now(),last_success_at=now(),last_status='completed',
    consecutive_failures=0,last_error=null,
    next_run_at=now()+(cadence_hours||' hours')::interval,
    metadata=metadata||jsonb_build_object(
      'lastPackageId',v_package.id,'lastPackageHash',v_package.content_hash,
      'lastMode','idempotent_existing_package','lastRuntime',p_runtime
    ),updated_at=now()
  where lower(administrator)=lower(v_package.administrator);

  v_runtime_status := private.refresh_agentetome_source_status();
  return jsonb_build_object(
    'status','real','mode','idempotent_existing_package','packageId',v_package.id,
    'packageHash',v_package.content_hash,'connectorRunId',v_connector_run_id,
    'silver',v_silver,'runtimeStatus',v_runtime_status,'rawDownloadLinkPersisted',false
  );
end;
$$;
revoke all on function public.refresh_agentetome_existing_package(text,text,text)
  from public,anon,authenticated;
grant execute on function public.refresh_agentetome_existing_package(text,text,text)
  to service_role;

create or replace function public.finalize_agentetome_direct_package_v2(
  p_package_id uuid,
  p_headers jsonb,
  p_row_counts jsonb,
  p_bronze_rows integer,
  p_runtime text default 'agentetome-ingest-export-v4'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_base jsonb;
  v_package public.agentetome_export_packages%rowtype;
  v_silver jsonb;
  v_runtime_status jsonb;
begin
  v_base := public.finalize_agentetome_direct_package(
    p_package_id,p_headers,p_row_counts,p_bronze_rows,p_runtime
  );

  select * into v_package
  from public.agentetome_export_packages
  where id=p_package_id;
  if not found then raise exception 'agentetome_package_not_found'; end if;

  v_silver := private.sync_agentetome_fidc_market_events(v_package.content_hash);

  update public.agentetome_export_targets
  set
    last_attempt_at=now(),last_success_at=now(),last_status='completed',
    consecutive_failures=0,last_error=null,
    next_run_at=now()+(cadence_hours||' hours')::interval,
    metadata=metadata||jsonb_build_object(
      'lastPackageId',v_package.id,'lastPackageHash',v_package.content_hash,
      'lastMode','new_package','lastRuntime',p_runtime
    ),updated_at=now()
  where lower(administrator)=lower(v_package.administrator);

  update public.agentetome_export_packages
  set metadata=metadata||jsonb_build_object(
    'automatic_silver_sync',true,'automatic_silver_sync_at',now()
  ),updated_at=now()
  where id=v_package.id;

  v_runtime_status := private.refresh_agentetome_source_status();
  return v_base || jsonb_build_object(
    'silver',v_silver,'runtimeStatus',v_runtime_status,'automaticSilverSync',true
  );
end;
$$;
revoke all on function public.finalize_agentetome_direct_package_v2(uuid,jsonb,jsonb,integer,text)
  from public,anon,authenticated;
grant execute on function public.finalize_agentetome_direct_package_v2(uuid,jsonb,jsonb,integer,text)
  to service_role;

create or replace function public.queue_agentetome_admin_export(
  p_admin text default 'oliveira trust',
  p_cut text default 'recente',
  p_competence text default null,
  p_format text default 'csv',
  p_requested_by uuid default null,
  p_trigger_type text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_result jsonb;
  v_request_id text;
  v_source_id uuid;
begin
  if p_trigger_type not in ('manual','scheduled','retry') then
    raise exception 'invalid_agentetome_trigger_type';
  end if;

  select id into v_source_id
  from public.source_catalog
  where metadata->>'code'='src_agentetome_api'
  limit 1;

  begin
    v_result := private.run_agentetome_export_ingestion(p_admin,p_cut,p_competence,p_format);
    v_request_id := v_result->>'pg_net_request_id';

    if v_request_id is not null then
      update public.agentetome_ingestion_tokens
      set metadata=metadata||jsonb_build_object(
        'trigger_type',p_trigger_type,'requested_by',p_requested_by,'queued_at',now()
      )
      where metadata->>'pg_net_request_id'=v_request_id;
    end if;

    update public.agentetome_export_targets
    set
      last_attempt_at=now(),last_queued_at=now(),last_status='queued',last_error=null,
      next_run_at=now()+(cadence_hours||' hours')::interval,
      metadata=metadata||jsonb_build_object(
        'lastTriggerType',p_trigger_type,'lastPgNetRequestId',v_request_id,'lastQueuedAt',now()
      ),updated_at=now()
    where lower(administrator)=lower(trim(p_admin));

    return v_result||jsonb_build_object(
      'trigger_type',p_trigger_type,'administrator',trim(p_admin),'raw_download_link_persisted',false
    );
  exception when others then
    update public.agentetome_export_targets
    set
      last_attempt_at=now(),last_status='failed',consecutive_failures=consecutive_failures+1,
      last_error=left(sqlerrm,900),next_run_at=now()+interval '2 hours',updated_at=now()
    where lower(administrator)=lower(trim(p_admin));

    insert into public.agentetome_operation_runs (
      source_id,requested_by,operation,status,administrator,competence,format,
      response_summary,http_status,duration_ms
    ) values (
      v_source_id,p_requested_by,'admin_export','failed',trim(p_admin),p_competence,p_format,
      jsonb_build_object('error',sqlerrm,'trigger_type',p_trigger_type,'raw_download_link_persisted',false),
      502,0
    );

    perform private.refresh_agentetome_source_status();
    return jsonb_build_object(
      'status','failed','provider','agentetome','provider_error',true,
      'administrator',trim(p_admin),'trigger_type',p_trigger_type,'error',sqlerrm
    );
  end;
end;
$$;
revoke all on function public.queue_agentetome_admin_export(text,text,text,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.queue_agentetome_admin_export(text,text,text,text,uuid,text)
  to service_role;

create or replace function private.run_agentetome_due_exports()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_target public.agentetome_export_targets%rowtype;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  for v_target in
    select *
    from public.agentetome_export_targets
    where active and next_run_at<=now()
    order by priority asc,next_run_at asc
    limit 3
    for update skip locked
  loop
    v_result := public.queue_agentetome_admin_export(
      v_target.administrator,v_target.cut,v_target.competence,v_target.format,null,
      case when v_target.consecutive_failures>0 then 'retry' else 'scheduled' end
    );
    v_results := v_results||jsonb_build_array(v_result);
    v_count := v_count+1;
  end loop;

  if v_count=0 then
    perform private.refresh_agentetome_source_status();
  end if;

  return jsonb_build_object('status','completed','targetsQueued',v_count,'results',v_results,'ranAt',now());
end;
$$;
revoke all on function private.run_agentetome_due_exports() from public,anon,authenticated;
grant execute on function private.run_agentetome_due_exports() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname='agentetome-due-export-refresh';

select cron.schedule(
  'agentetome-due-export-refresh',
  '17 * * * *',
  $$select private.run_agentetome_due_exports();$$
);

select private.refresh_agentetome_source_status();
notify pgrst,'reload schema';
