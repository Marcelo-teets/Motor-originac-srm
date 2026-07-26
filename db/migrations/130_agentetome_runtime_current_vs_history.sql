-- Runtime metrics must distinguish the current Market Map snapshot from retained
-- historical events. The product metric `fidcEvents` is the actionable current
-- snapshot; `historicalFidcEvents` is audit history.

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
  v_historical_fidc_events integer;
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
  from public.agentetome_fidc_market_map_v1;

  select count(*)::integer into v_historical_fidc_events
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
    v_blockers := v_blockers||jsonb_build_array(jsonb_build_object(
      'code','secret_missing','title','Chave do Agentetome ausente no Vault',
      'nextAction','Cadastrar agentetome_api_key no Supabase Vault.'
    ));
  end if;
  if v_active_targets=0 then
    v_blockers := v_blockers||jsonb_build_array(jsonb_build_object(
      'code','no_active_target','title','Nenhuma administradora ativa',
      'nextAction','Ativar ao menos um registro em agentetome_export_targets.'
    ));
  end if;
  if v_parsed_packages=0 then
    v_blockers := v_blockers||jsonb_build_array(jsonb_build_object(
      'code','no_parsed_package','title','Nenhum pacote validado',
      'nextAction','Executar uma ingestão real por administradora.'
    ));
  end if;
  if v_fidc_events=0 then
    v_blockers := v_blockers||jsonb_build_array(jsonb_build_object(
      'code','no_fidc_events','title','Snapshot FIDC vazio',
      'nextAction','Sincronizar o pacote atual para o Market Map.'
    ));
  end if;
  if not v_cron_active then
    v_blockers := v_blockers||jsonb_build_array(jsonb_build_object(
      'code','cron_inactive','title','Refresh automático inativo',
      'nextAction','Ativar o job agentetome-due-export-refresh.'
    ));
  end if;

  v_ready := v_secret_configured and v_active_targets>0 and v_parsed_packages>0
    and v_fidc_events>0 and v_cron_active;
  v_fresh := v_last_check_at is not null and v_last_check_at>=now()-interval '36 hours';

  if v_ready and not v_fresh then
    v_blockers := v_blockers||jsonb_build_array(jsonb_build_object(
      'code','refresh_stale','title','Última verificação acima de 36 horas',
      'nextAction','Executar refresh manual ou validar o worker agendado.'
    ));
  end if;

  return jsonb_build_object(
    'provider','agentetome','sourceCode','src_agentetome_api',
    'status',case when v_ready then 'real' else 'partial' end,
    'health',case when v_ready and v_fresh then 'healthy' else 'degraded' end,
    'configured',v_secret_configured,'secretMode','supabase_vault',
    'automaticRefresh',v_cron_active,'activeTargets',v_active_targets,
    'parsedPackages',v_parsed_packages,'failedPackages',v_failed_packages,
    'bronzeRows',v_bronze_rows,'fidcEvents',v_fidc_events,
    'historicalFidcEvents',v_historical_fidc_events,
    'lastPackageAt',v_last_package_at,'lastCheckAt',v_last_check_at,
    'lastSuccessAt',v_last_success_at,'latestReferenceDate',v_latest_reference_date,
    'latestObservedAt',v_latest_observed_at,'marketMapReady',v_fidc_events>0,
    'scoreImpact',false,
    'capabilities',jsonb_build_array('validate_fidc_xml','admin_manifest','admin_export_ingestion','fidc_market_map'),
    'edgeFunctions',jsonb_build_object(
      'ingest','agentetome-ingest-export-v4',
      'recovery','agentetome-recover-package-v2',
      'xmlValidation','agentetome-validate-xml-v1'
    ),
    'blockers',v_blockers,'generatedAt',now()
  );
end;
$$;

revoke all on function public.agentetome_runtime_status() from public,anon,authenticated;
grant execute on function public.agentetome_runtime_status() to service_role;

select private.refresh_agentetome_source_status();
notify pgrst,'reload schema';
