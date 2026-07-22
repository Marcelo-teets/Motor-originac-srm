-- Strategic public sources + explainable signal-factor map.
-- Extends the existing bronze -> normalized -> monitoring -> signals pipeline.
-- No parallel scoring stack is introduced: qualification, lead score, ranking,
-- thesis and pipeline consume the factor map through database triggers.

create extension if not exists pgcrypto;

insert into public.source_catalog (
  id, name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, created_at, updated_at, source_type,
  auth_requirement, rate_limit_notes, health
)
values
  (
    gen_random_uuid(),
    'Receita Federal QSA aberto completo',
    'https://arquivos.receitafederal.gov.br/cnpj/dados_abertos_cnpj/',
    'cadastral_ownership','BR',1,'critical','monthly','partial',
    'Persistir somente raízes CNPJ do Company Master; mascarar CPF e representante legal antes da camada bronze; comparar competências para detectar entradas e saídas societárias.',
    jsonb_build_object(
      'code','src_rfb_qsa_bulk','provider','rfb','datasetCode','rfb_qsa',
      'official',true,'free',true,'entityKey','cnpj_root',
      'captureMode','official_bulk_snapshot','refreshFrequency','monthly',
      'implementedRuntime',true,'implementationPhase','loader_active_pending_first_success',
      'privacyTreatment','natural-person identifiers masked and fingerprinted before persistence'
    ),
    now(),now(),'bulk_zip','none',
    'Arquivos nacionais particionados; usar streaming, checkpoint, hash e filtro prévio por raiz CNPJ.','degraded'
  ),
  (
    gen_random_uuid(),
    'CVM Formulário de Referência - Estrutura de Capital',
    'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FRE/DADOS/',
    'regulatory_capital_structure','BR',1,'critical','weekly','partial',
    'Processar apenas seções de endividamento, obrigações, capital social, posição acionária e partes relacionadas; deduplicar por CNPJ, seção, referência e hash.',
    jsonb_build_object(
      'code','src_cvm_fre_capital_structure','provider','cvm',
      'datasetCode','cvm_fre_capital_structure','official',true,'free',true,
      'entityKey','cnpj','captureMode','official_yearly_zip_weekly_refresh',
      'refreshFrequency','weekly','implementedRuntime',true,
      'implementationPhase','loader_active_pending_first_success',
      'sections',jsonb_build_array(
        'endividamento','obrigacao','capital_social_aumento','capital_social_reducao',
        'transacao_parte_relacionada','posicao_acionaria','distribuicao_capital'
      )
    ),
    now(),now(),'bulk_zip','none',
    'Sem chave; baixar o ZIP anual corrente e usar ETag/Last-Modified para não reprocessar conteúdo inalterado.','degraded'
  )
on conflict (name,url) do update set
  category=excluded.category,
  scope=excluded.scope,
  priority=excluded.priority,
  criticality=excluded.criticality,
  frequency=excluded.frequency,
  validation_rule=excluded.validation_rule,
  metadata=public.source_catalog.metadata||excluded.metadata,
  source_type=excluded.source_type,
  auth_requirement=excluded.auth_requirement,
  rate_limit_notes=excluded.rate_limit_notes,
  updated_at=now();

alter function public.get_public_data_operations_snapshot()
  rename to get_public_data_operations_snapshot_base;

create function public.get_public_data_operations_snapshot()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  base_payload jsonb;
  strategic_datasets jsonb;
  combined_datasets jsonb;
  recomputed_summary jsonb;
begin
  base_payload:=public.get_public_data_operations_snapshot_base();

  with definitions(dataset_code,source_code,display_name,cadence,execution_mode,signal_type,priority) as (
    values
      ('cvm_fre_capital_structure','src_cvm_fre_capital_structure','CVM · Formulário de Referência','weekly','scheduled','debt_maturity_pressure',7),
      ('rfb_qsa','src_rfb_qsa_bulk','Receita Federal · QSA','monthly','scheduled_partitioned','ownership_change',8)
  ), sources as (
    select id,name,status,health,metadata->>'code' as source_code from public.source_catalog
  ), latest_runs as (
    select distinct on (dataset_code) *
    from public.public_dataset_runs
    where dataset_code in ('cvm_fre_capital_structure','rfb_qsa')
    order by dataset_code,started_at desc
  ), run_stats as (
    select dataset_code,count(*)::integer as run_count,
      max(finished_at) filter (where status='completed') as last_successful_run_at
    from public.public_dataset_runs
    where dataset_code in ('cvm_fre_capital_structure','rfb_qsa')
    group by dataset_code
  ), checkpoints as (
    select dataset_code,count(*)::integer as checkpoint_count,
      count(*) filter (where status='completed')::integer as completed_checkpoints,
      count(*) filter (where status='failed')::integer as failed_checkpoints,
      count(*) filter (where status='partial')::integer as partial_checkpoints,
      coalesce(sum(rows_scanned),0)::bigint as rows_scanned,
      coalesce(sum(records_matched),0)::bigint as records_matched,
      max(last_successful_run_at) as last_successful_run_at,
      max(last_checked_at) as last_checked_at
    from public.public_dataset_resource_checkpoints
    where dataset_code in ('cvm_fre_capital_structure','rfb_qsa')
    group by dataset_code
  ), records as (
    select dataset_code,count(*)::integer as record_count,
      count(distinct company_id) filter (where company_id is not null)::integer as company_count,
      max(observed_at) as latest_record_at
    from public.public_company_records
    where dataset_code in ('cvm_fre_capital_structure','rfb_qsa')
    group by dataset_code
  ), outputs as (
    select payload->>'datasetCode' as dataset_code,count(*)::integer as output_count,max(observed_at) as latest_output_at
    from public.monitoring_outputs
    where payload->>'datasetCode' in ('cvm_fre_capital_structure','rfb_qsa')
    group by payload->>'datasetCode'
  ), signals as (
    select metadata->>'datasetCode' as dataset_code,count(*)::integer as signal_count,max(observed_at) as latest_signal_at
    from public.company_signals
    where metadata->>'datasetCode' in ('cvm_fre_capital_structure','rfb_qsa')
    group by metadata->>'datasetCode'
  ), rows as (
    select definition.*,source.id as source_id,source.name as source_name,
      coalesce(source.status,'partial') as source_status,
      coalesce(source.health,'degraded') as source_health,
      run.id as run_id,run.trigger_type,run.status as run_status,run.started_at,run.finished_at,
      coalesce(run.resources_discovered,0) as resources_discovered,
      coalesce(run.resources_processed,0) as resources_processed,
      coalesce(run.resources_skipped,0) as resources_skipped,
      coalesce(run.rows_scanned,0) as latest_rows_scanned,
      coalesce(run.records_matched,0) as latest_records_matched,
      coalesce(run.outputs_written,0) as latest_outputs_written,
      coalesce(run.signals_written,0) as latest_signals_written,
      run.error_message,
      coalesce((run.metadata->>'fullCoverageRequested')::boolean,false) as full_coverage_requested,
      coalesce(run_stats.run_count,0) as run_count,
      run_stats.last_successful_run_at as run_last_successful_at,
      coalesce(checkpoints.checkpoint_count,0) as checkpoint_count,
      coalesce(checkpoints.completed_checkpoints,0) as completed_checkpoints,
      coalesce(checkpoints.failed_checkpoints,0) as failed_checkpoints,
      coalesce(checkpoints.partial_checkpoints,0) as partial_checkpoints,
      coalesce(checkpoints.rows_scanned,0) as lifetime_rows_scanned,
      coalesce(checkpoints.records_matched,0) as lifetime_records_matched,
      checkpoints.last_successful_run_at as checkpoint_last_successful_at,
      checkpoints.last_checked_at,
      coalesce(records.record_count,0) as record_count,
      coalesce(records.company_count,0) as company_count,records.latest_record_at,
      coalesce(outputs.output_count,0) as output_count,outputs.latest_output_at,
      coalesce(signals.signal_count,0) as signal_count,signals.latest_signal_at,
      case when run.status='running' then 'running' when run.status='completed' then 'healthy'
        when run.status='partial' then 'attention' when run.status='failed' then 'blocked'
        else 'waiting' end as operational_status,
      case when run.id is null then 'Executar a primeira coleta e validar recursos, matches, outputs, sinais e fatores.'
        when run.status='failed' then 'Corrigir a última falha e reprocessar o dataset.'
        when run.status='partial' then 'Completar os recursos pendentes e validar a cobertura declarada.'
        when coalesce(records.record_count,0)=0 then 'Coleta sem matches; revisar CNPJs do Company Master e manter a cadência.'
        when coalesce(signals.signal_count,0)=0 then 'Validar sincronização de records para monitoring, signals e factor map.'
        else 'Revisar fatores, qualification, ranking e próxima ação comercial.' end as next_action
    from definitions definition
    left join sources source on source.source_code=definition.source_code
    left join latest_runs run on run.dataset_code=definition.dataset_code
    left join run_stats on run_stats.dataset_code=definition.dataset_code
    left join checkpoints on checkpoints.dataset_code=definition.dataset_code
    left join records on records.dataset_code=definition.dataset_code
    left join outputs on outputs.dataset_code=definition.dataset_code
    left join signals on signals.dataset_code=definition.dataset_code
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'datasetCode',row.dataset_code,'sourceCode',row.source_code,'displayName',row.display_name,
    'sourceId',row.source_id,'sourceName',row.source_name,'sourceStatus',row.source_status,
    'sourceHealth',row.source_health,'cadence',row.cadence,'executionMode',row.execution_mode,
    'signalType',row.signal_type,'operationalStatus',row.operational_status,'nextAction',row.next_action,
    'latestRun',case when row.run_id is null then null else jsonb_build_object(
      'id',row.run_id,'triggerType',row.trigger_type,'status',row.run_status,
      'startedAt',row.started_at,'finishedAt',row.finished_at,
      'resourcesDiscovered',row.resources_discovered,'resourcesProcessed',row.resources_processed,
      'resourcesSkipped',row.resources_skipped,'rowsScanned',row.latest_rows_scanned,
      'recordsMatched',row.latest_records_matched,'outputsWritten',row.latest_outputs_written,
      'signalsWritten',row.latest_signals_written,'fullCoverageRequested',row.full_coverage_requested,
      'errorMessage',row.error_message) end,
    'lifetime',jsonb_build_object(
      'runCount',row.run_count,'checkpointCount',row.checkpoint_count,
      'completedCheckpoints',row.completed_checkpoints,'failedCheckpoints',row.failed_checkpoints,
      'partialCheckpoints',row.partial_checkpoints,'rowsScanned',row.lifetime_rows_scanned,
      'recordsMatched',row.lifetime_records_matched,'recordsPersisted',row.record_count,
      'matchedCompanyCount',row.company_count,'outputsPersisted',row.output_count,
      'signalsPersisted',row.signal_count,
      'lastSuccessfulRunAt',coalesce(row.run_last_successful_at,row.checkpoint_last_successful_at),
      'lastCheckedAt',row.last_checked_at,'latestRecordAt',row.latest_record_at,
      'latestOutputAt',row.latest_output_at,'latestSignalAt',row.latest_signal_at)
  ) order by row.priority),'[]'::jsonb) into strategic_datasets from rows row;

  combined_datasets:=coalesce(base_payload->'datasets','[]'::jsonb)||strategic_datasets;

  select jsonb_build_object(
    'totalDatasets',count(*)::integer,
    'healthyDatasets',count(*) filter (where item->>'operationalStatus'='healthy')::integer,
    'runningDatasets',count(*) filter (where item->>'operationalStatus'='running')::integer,
    'attentionDatasets',count(*) filter (where item->>'operationalStatus'='attention')::integer,
    'blockedDatasets',count(*) filter (where item->>'operationalStatus'='blocked')::integer,
    'waitingDatasets',count(*) filter (where item->>'operationalStatus'='waiting')::integer,
    'rowsScanned',coalesce(sum((item#>>'{lifetime,rowsScanned}')::bigint),0),
    'recordsPersisted',coalesce(sum((item#>>'{lifetime,recordsPersisted}')::bigint),0),
    'outputsPersisted',coalesce(sum((item#>>'{lifetime,outputsPersisted}')::bigint),0),
    'signalsPersisted',coalesce(sum((item#>>'{lifetime,signalsPersisted}')::bigint),0),
    'registeredSources',count(distinct (item->>'sourceId')) filter (where nullif(item->>'sourceId','') is not null)::integer,
    'targetCompaniesWithValidCnpj',coalesce((base_payload#>>'{summary,targetCompaniesWithValidCnpj}')::integer,0)
  ) into recomputed_summary from jsonb_array_elements(combined_datasets) item;

  return jsonb_build_object('generatedAt',now(),'summary',recomputed_summary,
    'blockers',coalesce(base_payload->'blockers','[]'::jsonb),'datasets',combined_datasets);
end;
$$;

revoke execute on function public.get_public_data_operations_snapshot() from anon,authenticated;
grant execute on function public.get_public_data_operations_snapshot() to service_role;
