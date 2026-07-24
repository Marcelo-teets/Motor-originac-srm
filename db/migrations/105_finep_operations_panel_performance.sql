-- Keep the Finep operations panel below the API statement timeout.
-- These expression indexes benefit every dataset-level operational query.

create index if not exists idx_monitoring_outputs_dataset_code_observed
  on public.monitoring_outputs ((payload ->> 'datasetCode'), observed_at desc)
  where payload ? 'datasetCode';

create index if not exists idx_company_signals_dataset_code_observed
  on public.company_signals ((metadata ->> 'datasetCode'), observed_at desc)
  where metadata ? 'datasetCode';

create or replace function public.get_public_data_operations_snapshot()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  base_payload jsonb;
  finep_dataset jsonb;
  combined_datasets jsonb;
  recomputed_summary jsonb;
  source_row public.source_catalog%rowtype;
  run_row public.public_dataset_runs%rowtype;
  run_count integer:=0;
  run_last_successful_at timestamptz;
  checkpoint_count integer:=0;
  completed_checkpoints integer:=0;
  failed_checkpoints integer:=0;
  partial_checkpoints integer:=0;
  checkpoint_rows_scanned bigint:=0;
  checkpoint_records_matched bigint:=0;
  checkpoint_last_checked_at timestamptz;
  record_count integer:=0;
  company_count integer:=0;
  latest_record_at timestamptz;
  output_count integer:=0;
  latest_output_at timestamptz;
  signal_count integer:=0;
  latest_signal_at timestamptz;
begin
  base_payload:=public.get_public_data_operations_snapshot_pre_finep();

  select * into source_row
  from public.source_catalog
  where metadata->>'code'='src_finep_financing_operations'
  limit 1;

  select * into run_row
  from public.public_dataset_runs
  where dataset_code='finep_financing_operations'
  order by started_at desc
  limit 1;

  select count(*)::integer,
    max(finished_at) filter (where status='completed')
  into run_count,run_last_successful_at
  from public.public_dataset_runs
  where dataset_code='finep_financing_operations';

  select count(*)::integer,
    count(*) filter (where status='completed')::integer,
    count(*) filter (where status='failed')::integer,
    count(*) filter (where status='partial')::integer,
    coalesce(sum(rows_scanned),0)::bigint,
    coalesce(sum(records_matched),0)::bigint,
    max(last_checked_at)
  into checkpoint_count,completed_checkpoints,failed_checkpoints,partial_checkpoints,
    checkpoint_rows_scanned,checkpoint_records_matched,checkpoint_last_checked_at
  from public.public_dataset_resource_checkpoints
  where dataset_code='finep_financing_operations';

  select count(*)::integer,
    count(distinct company_id) filter (where company_id is not null)::integer,
    max(observed_at)
  into record_count,company_count,latest_record_at
  from public.public_company_records
  where dataset_code='finep_financing_operations';

  select count(*)::integer,max(observed_at)
  into output_count,latest_output_at
  from public.monitoring_outputs
  where payload->>'datasetCode'='finep_financing_operations';

  select count(*)::integer,max(observed_at)
  into signal_count,latest_signal_at
  from public.company_signals
  where metadata->>'datasetCode'='finep_financing_operations';

  finep_dataset:=jsonb_build_object(
    'datasetCode','finep_financing_operations',
    'sourceCode','src_finep_financing_operations',
    'displayName','Finep · Operações e Desembolsos',
    'sourceId',source_row.id,
    'sourceName',source_row.name,
    'sourceStatus',coalesce(source_row.status,'partial'),
    'sourceHealth',coalesce(source_row.health,'degraded'),
    'cadence','weekly',
    'executionMode','scheduled_github_actions',
    'signalType','public_financing_signal / innovation_disbursement_signal',
    'operationalStatus',case
      when run_row.status='running' then 'running'
      when run_row.status='completed' then 'healthy'
      when run_row.status='partial' then 'attention'
      when run_row.status='failed' then 'blocked'
      else 'waiting' end,
    'nextAction',case
      when run_row.id is null then 'Executar a primeira carga e validar matches no Company Master.'
      when run_row.status='failed' then 'Corrigir o workbook/loader e reprocessar.'
      when record_count=0 then 'Carga sem matches; ampliar o Company Master real e manter a cadência.'
      when signal_count=0 then 'Validar outputs, sinais e factor map Finep.'
      else 'Revisar natureza do funding, cronograma de desembolsos, fatores e próxima ação comercial.' end,
    'latestRun',case when run_row.id is null then null else jsonb_build_object(
      'id',run_row.id,
      'triggerType',run_row.trigger_type,
      'status',run_row.status,
      'startedAt',run_row.started_at,
      'finishedAt',run_row.finished_at,
      'resourcesDiscovered',coalesce(run_row.resources_discovered,0),
      'resourcesProcessed',coalesce(run_row.resources_processed,0),
      'resourcesSkipped',coalesce(run_row.resources_skipped,0),
      'rowsScanned',coalesce(run_row.rows_scanned,0),
      'recordsMatched',coalesce(run_row.records_matched,0),
      'outputsWritten',coalesce(run_row.outputs_written,0),
      'signalsWritten',coalesce(run_row.signals_written,0),
      'fullCoverageRequested',false,
      'errorMessage',run_row.error_message) end,
    'lifetime',jsonb_build_object(
      'runCount',run_count,
      'checkpointCount',checkpoint_count,
      'completedCheckpoints',completed_checkpoints,
      'failedCheckpoints',failed_checkpoints,
      'partialCheckpoints',partial_checkpoints,
      'rowsScanned',checkpoint_rows_scanned,
      'recordsMatched',checkpoint_records_matched,
      'recordsPersisted',record_count,
      'matchedCompanyCount',company_count,
      'outputsPersisted',output_count,
      'signalsPersisted',signal_count,
      'lastSuccessfulRunAt',run_last_successful_at,
      'lastCheckedAt',checkpoint_last_checked_at,
      'latestRecordAt',latest_record_at,
      'latestOutputAt',latest_output_at,
      'latestSignalAt',latest_signal_at)
  );

  combined_datasets:=coalesce(base_payload->'datasets','[]'::jsonb)||jsonb_build_array(finep_dataset);

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
  ) into recomputed_summary
  from jsonb_array_elements(combined_datasets) item;

  return jsonb_build_object(
    'generatedAt',now(),
    'summary',recomputed_summary,
    'blockers',coalesce(base_payload->'blockers','[]'::jsonb),
    'datasets',combined_datasets
  );
end;
$$;

revoke execute on function public.get_public_data_operations_snapshot() from anon,authenticated;
grant execute on function public.get_public_data_operations_snapshot() to service_role;
