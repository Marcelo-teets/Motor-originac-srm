-- Operational snapshot for the Sources page.
-- Aggregates public loader runs, checkpoints, records, outputs and signals in Postgres
-- so the API does not scan large tables inside a serverless request.

create or replace function public.get_public_data_operations_snapshot()
returns jsonb
language sql
security invoker
set search_path = public
as $$
with dataset_definitions (
  dataset_code,
  source_code,
  display_name,
  cadence,
  execution_mode,
  signal_type,
  priority
) as (
  values
    ('cgu_ceis', 'src_cgu_transparencia_bulk', 'CGU · CEIS', 'daily', 'scheduled', 'legal_compliance_risk', 1),
    ('cgu_cnep', 'src_cgu_transparencia_bulk', 'CGU · CNEP', 'daily', 'scheduled', 'legal_compliance_risk', 2),
    ('bndes_financing_operations', 'src_bndes_financing_operations', 'BNDES · Operações de financiamento', 'weekly', 'scheduled', 'public_financing_signal', 3),
    ('compras_contracts', 'src_compras_gov_contracts', 'Compras.gov · Contratos públicos', 'weekly', 'scheduled', 'public_contract_receivables', 4),
    ('pgfn_debt', 'src_pgfn_divida_ativa_bulk', 'PGFN · Dívida ativa', 'monthly', 'scheduled', 'fiscal_stress', 5),
    ('rfb_cnpj', 'src_rfb_cnpj_bulk', 'Receita Federal · CNPJ', 'monthly', 'manual_partitioned', 'corporate_structure_change', 6)
),
valid_companies as (
  select count(*)::integer as count
  from public.companies
  where length(regexp_replace(coalesce(cnpj, ''), '[^0-9]', '', 'g')) = 14
),
global_run_state as (
  select count(*)::integer as total_runs
  from public.public_dataset_runs
),
source_rows as (
  select
    id,
    name,
    status,
    health,
    metadata ->> 'code' as source_code
  from public.source_catalog
),
latest_runs as (
  select distinct on (dataset_code)
    dataset_code,
    id,
    trigger_type,
    status,
    started_at,
    finished_at,
    resources_discovered,
    resources_processed,
    resources_skipped,
    rows_scanned,
    records_matched,
    bronze_rows_written,
    normalized_rows_written,
    outputs_written,
    signals_written,
    error_message,
    metadata
  from public.public_dataset_runs
  order by dataset_code, started_at desc
),
run_stats as (
  select
    dataset_code,
    count(*)::integer as run_count,
    max(finished_at) filter (where status = 'completed') as last_successful_run_at
  from public.public_dataset_runs
  group by dataset_code
),
checkpoint_stats as (
  select
    dataset_code,
    count(*)::integer as checkpoint_count,
    count(*) filter (where status = 'completed')::integer as completed_checkpoints,
    count(*) filter (where status = 'failed')::integer as failed_checkpoints,
    count(*) filter (where status = 'partial')::integer as partial_checkpoints,
    coalesce(sum(rows_scanned), 0)::bigint as lifetime_rows_scanned,
    coalesce(sum(records_matched), 0)::bigint as lifetime_records_matched,
    max(last_successful_run_at) as last_checkpoint_success_at,
    max(last_checked_at) as last_checked_at
  from public.public_dataset_resource_checkpoints
  group by dataset_code
),
record_stats as (
  select
    dataset_code,
    count(*)::integer as record_count,
    count(distinct company_id) filter (where company_id is not null)::integer as matched_company_count,
    max(observed_at) as latest_record_at
  from public.public_company_records
  group by dataset_code
),
output_stats as (
  select
    payload ->> 'datasetCode' as dataset_code,
    count(*)::integer as output_count,
    max(observed_at) as latest_output_at
  from public.monitoring_outputs
  where payload ? 'publicRecordKey'
  group by payload ->> 'datasetCode'
),
signal_stats as (
  select
    metadata ->> 'datasetCode' as dataset_code,
    count(*)::integer as signal_count,
    max(observed_at) as latest_signal_at
  from public.company_signals
  where metadata ? 'publicRecordKey'
  group by metadata ->> 'datasetCode'
),
dataset_rows as (
  select
    definition.*,
    source.id as source_id,
    source.name as source_name,
    coalesce(source.status, 'partial') as source_status,
    coalesce(source.health, 'degraded') as source_health,
    run.id as latest_run_id,
    run.trigger_type,
    run.status as latest_run_status,
    run.started_at,
    run.finished_at,
    coalesce(run.resources_discovered, 0) as resources_discovered,
    coalesce(run.resources_processed, 0) as resources_processed,
    coalesce(run.resources_skipped, 0) as resources_skipped,
    coalesce(run.rows_scanned, 0) as latest_rows_scanned,
    coalesce(run.records_matched, 0) as latest_records_matched,
    coalesce(run.outputs_written, 0) as latest_outputs_written,
    coalesce(run.signals_written, 0) as latest_signals_written,
    run.error_message,
    coalesce((run.metadata ->> 'fullCoverageRequested')::boolean, false) as full_coverage_requested,
    coalesce(run_stats.run_count, 0) as run_count,
    run_stats.last_successful_run_at,
    coalesce(checkpoint_stats.checkpoint_count, 0) as checkpoint_count,
    coalesce(checkpoint_stats.completed_checkpoints, 0) as completed_checkpoints,
    coalesce(checkpoint_stats.failed_checkpoints, 0) as failed_checkpoints,
    coalesce(checkpoint_stats.partial_checkpoints, 0) as partial_checkpoints,
    coalesce(checkpoint_stats.lifetime_rows_scanned, 0) as lifetime_rows_scanned,
    coalesce(checkpoint_stats.lifetime_records_matched, 0) as lifetime_records_matched,
    checkpoint_stats.last_checkpoint_success_at,
    checkpoint_stats.last_checked_at,
    coalesce(record_stats.record_count, 0) as record_count,
    coalesce(record_stats.matched_company_count, 0) as matched_company_count,
    record_stats.latest_record_at,
    coalesce(output_stats.output_count, 0) as output_count,
    output_stats.latest_output_at,
    coalesce(signal_stats.signal_count, 0) as signal_count,
    signal_stats.latest_signal_at,
    case
      when run.status = 'running' then 'running'
      when run.status = 'completed' then 'healthy'
      when run.status = 'partial' then 'attention'
      when run.status = 'failed' then 'blocked'
      else 'waiting'
    end as operational_status,
    case
      when run.id is null and global_run_state.total_runs = 0 then 'Disponibilizar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no GitHub Actions e executar o canário autenticado.'
      when run.id is null then 'Executar a primeira coleta deste dataset e validar cobertura, matches e checkpoints.'
      when run.status = 'failed' then 'Corrigir a falha da última execução e reprocessar o dataset.'
      when run.status = 'partial' then 'Reprocessar os recursos com erro até completar a cobertura declarada.'
      when run.status = 'running' then 'Aguardar o término e revisar checkpoints, matches e sinais.'
      when coalesce(record_stats.record_count, 0) = 0 then 'Cobertura executada sem matches; manter a cadência e revisar a qualidade dos CNPJs monitorados.'
      when coalesce(signal_stats.signal_count, 0) = 0 then 'Revisar os registros aderentes e validar a sincronização para monitoring e signals.'
      else 'Revisar os sinais company-level e atualizar qualification, patterns, ranking e próxima ação comercial.'
    end as next_action
  from dataset_definitions definition
  cross join global_run_state
  left join source_rows source on source.source_code = definition.source_code
  left join latest_runs run on run.dataset_code = definition.dataset_code
  left join run_stats on run_stats.dataset_code = definition.dataset_code
  left join checkpoint_stats on checkpoint_stats.dataset_code = definition.dataset_code
  left join record_stats on record_stats.dataset_code = definition.dataset_code
  left join output_stats on output_stats.dataset_code = definition.dataset_code
  left join signal_stats on signal_stats.dataset_code = definition.dataset_code
),
summary as (
  select
    count(*)::integer as total_datasets,
    count(*) filter (where operational_status = 'healthy')::integer as healthy_datasets,
    count(*) filter (where operational_status = 'running')::integer as running_datasets,
    count(*) filter (where operational_status = 'attention')::integer as attention_datasets,
    count(*) filter (where operational_status = 'blocked')::integer as blocked_datasets,
    count(*) filter (where operational_status = 'waiting')::integer as waiting_datasets,
    coalesce(sum(lifetime_rows_scanned), 0)::bigint as rows_scanned,
    coalesce(sum(record_count), 0)::bigint as records_persisted,
    coalesce(sum(output_count), 0)::bigint as outputs_persisted,
    coalesce(sum(signal_count), 0)::bigint as signals_persisted,
    count(distinct source_id) filter (where source_id is not null)::integer as registered_sources
  from dataset_rows
),
blockers as (
  select jsonb_build_object(
    'code', 'github_actions_supabase_secrets',
    'severity', 'critical',
    'title', 'GitHub Actions sem credenciais do Supabase',
    'detail', 'Nenhum loader público possui execução persistida; o diagnóstico owner-only confirmou falha na validação de SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.',
    'nextAction', 'Cadastrar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em Settings → Secrets and variables → Actions e reabrir o canário CEIS/CNEP.'
  ) as blocker
  where not exists (select 1 from public.public_dataset_runs)
  union all
  select jsonb_build_object(
    'code', 'failed_public_dataset_runs',
    'severity', 'high',
    'title', 'Há loaders públicos com falha persistida',
    'detail', concat(count(*), ' dataset(s) com última execução failed.'),
    'nextAction', 'Abrir o detalhe do dataset, corrigir o erro e executar novamente.'
  )
  from dataset_rows
  having count(*) filter (where operational_status = 'blocked') > 0
)
select jsonb_build_object(
  'generatedAt', now(),
  'summary', jsonb_build_object(
    'totalDatasets', summary.total_datasets,
    'healthyDatasets', summary.healthy_datasets,
    'runningDatasets', summary.running_datasets,
    'attentionDatasets', summary.attention_datasets,
    'blockedDatasets', summary.blocked_datasets,
    'waitingDatasets', summary.waiting_datasets,
    'rowsScanned', summary.rows_scanned,
    'recordsPersisted', summary.records_persisted,
    'outputsPersisted', summary.outputs_persisted,
    'signalsPersisted', summary.signals_persisted,
    'registeredSources', summary.registered_sources,
    'targetCompaniesWithValidCnpj', valid_companies.count
  ),
  'blockers', coalesce((select jsonb_agg(blocker) from blockers), '[]'::jsonb),
  'datasets', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'datasetCode', row.dataset_code,
        'sourceCode', row.source_code,
        'displayName', row.display_name,
        'sourceId', row.source_id,
        'sourceName', row.source_name,
        'sourceStatus', row.source_status,
        'sourceHealth', row.source_health,
        'cadence', row.cadence,
        'executionMode', row.execution_mode,
        'signalType', row.signal_type,
        'operationalStatus', row.operational_status,
        'nextAction', row.next_action,
        'latestRun', case when row.latest_run_id is null then null else jsonb_build_object(
          'id', row.latest_run_id,
          'triggerType', row.trigger_type,
          'status', row.latest_run_status,
          'startedAt', row.started_at,
          'finishedAt', row.finished_at,
          'resourcesDiscovered', row.resources_discovered,
          'resourcesProcessed', row.resources_processed,
          'resourcesSkipped', row.resources_skipped,
          'rowsScanned', row.latest_rows_scanned,
          'recordsMatched', row.latest_records_matched,
          'outputsWritten', row.latest_outputs_written,
          'signalsWritten', row.latest_signals_written,
          'fullCoverageRequested', row.full_coverage_requested,
          'errorMessage', row.error_message
        ) end,
        'lifetime', jsonb_build_object(
          'runCount', row.run_count,
          'checkpointCount', row.checkpoint_count,
          'completedCheckpoints', row.completed_checkpoints,
          'failedCheckpoints', row.failed_checkpoints,
          'partialCheckpoints', row.partial_checkpoints,
          'rowsScanned', row.lifetime_rows_scanned,
          'recordsMatched', row.lifetime_records_matched,
          'recordsPersisted', row.record_count,
          'matchedCompanyCount', row.matched_company_count,
          'outputsPersisted', row.output_count,
          'signalsPersisted', row.signal_count,
          'lastSuccessfulRunAt', coalesce(row.last_successful_run_at, row.last_checkpoint_success_at),
          'lastCheckedAt', row.last_checked_at,
          'latestRecordAt', row.latest_record_at,
          'latestOutputAt', row.latest_output_at,
          'latestSignalAt', row.latest_signal_at
        )
      ) order by row.priority
    )
    from dataset_rows row
  ), '[]'::jsonb)
)
from summary
cross join valid_companies;
$$;

grant execute on function public.get_public_data_operations_snapshot() to service_role;
revoke execute on function public.get_public_data_operations_snapshot() from anon, authenticated;
