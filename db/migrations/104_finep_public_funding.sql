-- Finep official operations and disbursements.
-- Extends the existing public-data -> monitoring -> signals -> factor map pipeline.
-- Grants, equity investment and reimbursable credit remain financially distinct.

insert into public.source_catalog (
  id,name,url,category,scope,priority,criticality,frequency,status,
  validation_rule,metadata,created_at,updated_at,source_type,
  auth_requirement,rate_limit_notes,health
)
values (
  gen_random_uuid(),
  'Finep Operações e Desembolsos',
  'https://legacy.finep.gov.br/transparencia-finep/paineis-e-downloads/central-de-downloads',
  'public_innovation_funding','BR',2,'high','weekly','partial',
  'Descobrir e validar os XLSX oficiais; processar somente empresas reais e revisadas; separar crédito reembolsável, subvenção, investimento direto e desembolso; não inferir funding gap automaticamente.',
  jsonb_build_object(
    'code','src_finep_financing_operations',
    'provider','finep',
    'datasetCode','finep_financing_operations',
    'official',true,
    'free',true,
    'sourceAuthority','official_primary',
    'entityKey','cnpj',
    'captureMode','official_weekly_xlsx',
    'refreshFrequency','weekly',
    'operationsUrl','https://download.finep.gov.br/Contratacao.xlsx',
    'disbursementsUrl','https://download.finep.gov.br/Liberacao.xlsx',
    'implementedRuntime',true,
    'implementationPhase','connector_ready_pending_first_production_ingestion',
    'financialNatureSeparation',jsonb_build_array('reimbursable_credit','non_reimbursable_grant','equity_investment')
  ),
  now(),now(),'xlsx','none',
  'Arquivos públicos semanais; usar ETag/Last-Modified, parser XLSX bounded e checkpoint por workbook.','degraded'
)
on conflict (name,url) do update set
  category=excluded.category,
  scope=excluded.scope,
  priority=excluded.priority,
  criticality=excluded.criticality,
  frequency=excluded.frequency,
  validation_rule=excluded.validation_rule,
  metadata=coalesce(public.source_catalog.metadata,'{}'::jsonb)||excluded.metadata,
  source_type=excluded.source_type,
  auth_requirement=excluded.auth_requirement,
  rate_limit_notes=excluded.rate_limit_notes,
  updated_at=now();

create or replace function public.sync_finep_company_signals(p_dataset_code text default 'finep_financing_operations')
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare signals_count integer:=0;
begin
  insert into public.company_signals (
    id,company_id,source_id,monitoring_output_id,signal_type,signal_label,
    strength,confidence,is_explicit,evidence_url,evidence_text,observed_at,
    metadata,signal_strength,confidence_score,evidence_payload,
    observed_vs_inferred,created_at,updated_at
  )
  select
    gen_random_uuid(),record.company_id,source.id,output.id,
    case record.record_type
      when 'finep_credit_operation' then 'public_financing_signal'
      when 'finep_grant_operation' then 'innovation_investment_signal'
      when 'finep_direct_investment' then 'innovation_investment_signal'
      when 'finep_disbursement' then 'innovation_disbursement_signal'
    end,
    case record.record_type
      when 'finep_credit_operation' then 'Crédito Finep contratado'
      when 'finep_grant_operation' then 'Subvenção ou apoio não reembolsável Finep'
      when 'finep_direct_investment' then 'Investimento direto Finep em startup'
      when 'finep_disbursement' then 'Desembolso Finep realizado'
    end,
    case record.record_type
      when 'finep_credit_operation' then 82
      when 'finep_grant_operation' then 72
      when 'finep_direct_investment' then 78
      when 'finep_disbursement' then 80
    end,
    96,true,record.source_url,
    coalesce(record.normalized_payload->>'summary',record.record_type),
    coalesce(record.reference_date::timestamptz,record.observed_at),
    jsonb_build_object(
      'publicRecordKey',record.record_key,
      'datasetCode',record.dataset_code,
      'sourceCode',record.source_code,
      'recordType',record.record_type,
      'entityCnpj',record.entity_cnpj,
      'referenceDate',record.reference_date,
      'amount',record.amount,
      'status',record.status,
      'fundingNature',record.normalized_payload->>'fundingNature'
    ),
    case record.record_type
      when 'finep_credit_operation' then 82
      when 'finep_grant_operation' then 72
      when 'finep_direct_investment' then 78
      when 'finep_disbursement' then 80
    end,
    0.96,
    jsonb_build_object(
      'label',replace(record.record_type,'_',' '),
      'summary',coalesce(record.normalized_payload->>'summary',record.record_type),
      'sourceUrl',record.source_url,
      'datasetCode',record.dataset_code,
      'sourceCode',record.source_code,
      'recordKey',record.record_key,
      'normalized',record.normalized_payload
    ),
    'observed',now(),now()
  from public.public_company_records record
  left join public.source_catalog source on source.metadata->>'code'=record.source_code
  left join public.monitoring_outputs output
    on output.company_id=record.company_id
   and output.source_id is not distinct from source.id
   and output.payload->>'publicRecordKey'=record.record_key
  where record.company_id is not null
    and record.dataset_code=p_dataset_code
    and record.record_type in ('finep_credit_operation','finep_grant_operation','finep_direct_investment','finep_disbursement')
    and not exists (
      select 1 from public.company_signals existing
      where existing.company_id=record.company_id
        and existing.signal_type=case record.record_type
          when 'finep_credit_operation' then 'public_financing_signal'
          when 'finep_grant_operation' then 'innovation_investment_signal'
          when 'finep_direct_investment' then 'innovation_investment_signal'
          when 'finep_disbursement' then 'innovation_disbursement_signal' end
        and existing.metadata->>'publicRecordKey'=record.record_key
    );
  get diagnostics signals_count=row_count;
  return jsonb_build_object('signals_written',signals_count);
end;
$$;
revoke all on function public.sync_finep_company_signals(text) from public,anon,authenticated;
grant execute on function public.sync_finep_company_signals(text) to service_role;

insert into public.origination_factor_catalog (
  code,name,dimension,description,hypothesis,positive_direction,
  default_weight,decay_days,version,active
)
values
  ('innovation_capex_cycle','Ciclo de investimento em inovação','timing',
   'Crédito, subvenção ou investimento institucional destinado a projeto de inovação.',
   'Um projeto de inovação contratado cria cronograma de investimento, contrapartidas e possíveis necessidades complementares de capital.',
   true,1.10,365,1,true),
  ('public_funding_execution','Execução de funding público','executability',
   'Liberações oficiais comprovam execução financeira do projeto apoiado.',
   'Desembolsos realizados reduzem incerteza sobre execução e ajudam a dimensionar capital complementar sem presumir insuficiência.',
   true,0.95,365,1,true)
on conflict (code) do update set
  name=excluded.name,dimension=excluded.dimension,description=excluded.description,
  hypothesis=excluded.hypothesis,positive_direction=excluded.positive_direction,
  default_weight=excluded.default_weight,decay_days=excluded.decay_days,
  version=excluded.version,active=excluded.active,updated_at=now();

with rules(signal_type,factor_code,source_code,base_contribution,min_strength,confidence_floor,rationale) as (values
  ('public_financing_signal','innovation_capex_cycle','src_finep_financing_operations',14.0,70.0,0.90,'Crédito Finep confirma projeto de inovação e cria janela para mapear contrapartida, cronograma e capital complementar.'),
  ('innovation_investment_signal','innovation_capex_cycle','src_finep_financing_operations',20.0,65.0,0.90,'Subvenção ou investimento direto confirma ciclo institucional de inovação sem caracterizar dívida.'),
  ('innovation_disbursement_signal','innovation_capex_cycle','src_finep_financing_operations',14.0,70.0,0.90,'Liberação recente aumenta o timing para acompanhar execução e próximos marcos do projeto.'),
  ('innovation_disbursement_signal','public_funding_execution','src_finep_financing_operations',22.0,70.0,0.90,'Desembolso oficial é evidência forte de execução financeira do funding público.')
)
insert into public.source_factor_rules (
  signal_type,factor_id,source_code,base_contribution,min_strength,
  confidence_floor,rule_version,rationale,active,created_at,updated_at
)
select rule.signal_type,factor.id,rule.source_code,rule.base_contribution,
  rule.min_strength,rule.confidence_floor,1,rule.rationale,true,now(),now()
from rules rule
join public.origination_factor_catalog factor on factor.code=rule.factor_code
on conflict (signal_type,factor_id,source_code,rule_version) do update set
  base_contribution=excluded.base_contribution,
  min_strength=excluded.min_strength,
  confidence_floor=excluded.confidence_floor,
  rationale=excluded.rationale,
  active=true,
  updated_at=now();

insert into public.pattern_catalog (
  code,name,category,description,default_weight,active,pattern_name,pattern_family,
  explicit_features,latent_features,default_qualification_impact,
  default_lead_score_impact,default_ranking_impact,created_at,updated_at
)
values
  ('innovation_capex_funding_window','Janela de capital para inovação','timing',
   'Projeto de inovação com apoio Finep cria janela para dimensionar contrapartida, capex adicional e estrutura complementar.',
   1.0,true,'Janela de capital para inovação','funding_timing',
   array['finep_operation','innovation_investment'],array['capex_cycle','complementary_capital'],
   5,7,6,now(),now()),
  ('public_funding_execution_window','Funding público em execução','execution',
   'Desembolso Finep comprova execução e permite acompanhar marcos, uso de recursos e necessidade de complemento.',
   0.9,true,'Funding público em execução','execution_timing',
   array['finep_disbursement'],array['execution_visibility','next_funding_milestone'],
   4,6,5,now(),now())
on conflict (code) do update set
  name=excluded.name,category=excluded.category,description=excluded.description,
  default_weight=excluded.default_weight,active=excluded.active,
  pattern_name=excluded.pattern_name,pattern_family=excluded.pattern_family,
  explicit_features=excluded.explicit_features,latent_features=excluded.latent_features,
  default_qualification_impact=excluded.default_qualification_impact,
  default_lead_score_impact=excluded.default_lead_score_impact,
  default_ranking_impact=excluded.default_ranking_impact,updated_at=now();

create or replace function public.sync_factor_map_patterns()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare factor_map jsonb:=coalesce(new.evidence_payload->'factorMap',new.evidence->'factorMap',public.get_company_factor_map(new.company_id));
begin
  delete from public.company_patterns company_pattern
  using public.pattern_catalog pattern
  where company_pattern.company_id=new.company_id
    and company_pattern.pattern_id=pattern.id
    and pattern.code in (
      'ownership_change_window','debt_maturity_refinancing_window','capital_structure_change_window',
      'related_party_dependency_risk','innovation_capex_funding_window','public_funding_execution_window'
    );

  insert into public.company_patterns(
    id,company_id,pattern_id,confidence,rationale,supporting_signal_ids,
    detected_at,created_at,confidence_score,qualification_impact,
    lead_score_impact,ranking_impact,thesis_impact,evidence_payload
  )
  select gen_random_uuid(),new.company_id,pattern.id,
    round(least(100,greatest(55,coalesce((factor_item->>'score')::numeric,0))),2),
    case pattern.code
      when 'ownership_change_window' then 'Mudança societária oficial cria janela para confirmar sponsor, governança e novo ciclo de capital.'
      when 'debt_maturity_refinancing_window' then 'Perfil de dívida/obrigações no FRE cria hipótese de refinanciamento, alongamento ou DCM.'
      when 'capital_structure_change_window' then 'Evento formal de capital indica reorganização e timing financeiro.'
      when 'related_party_dependency_risk' then 'Dependência de partes relacionadas exige diligência e reduz executabilidade até validação.'
      when 'innovation_capex_funding_window' then 'Apoio Finep confirma ciclo de inovação; mapear contrapartida, cronograma e capital complementar sem presumir funding gap.'
      when 'public_funding_execution_window' then 'Desembolso Finep comprova execução e permite acompanhar próximos marcos financeiros do projeto.' end,
    coalesce((select array_agg(distinct observation.signal_id)
      from public.company_factor_observations observation
      join public.origination_factor_catalog factor on factor.id=observation.factor_id
      where observation.company_id=new.company_id and factor.code=case pattern.code
        when 'ownership_change_window' then 'ownership_change'
        when 'debt_maturity_refinancing_window' then 'debt_maturity_concentration'
        when 'capital_structure_change_window' then 'capital_cycle_change'
        when 'related_party_dependency_risk' then 'related_party_dependency'
        when 'innovation_capex_funding_window' then 'innovation_capex_cycle'
        when 'public_funding_execution_window' then 'public_funding_execution' end),'{}'::uuid[]),
    now(),now(),least(1,greatest(0,coalesce((factor_item->>'confidence')::numeric,0))),
    pattern.default_qualification_impact,pattern.default_lead_score_impact,pattern.default_ranking_impact,
    case pattern.code
      when 'ownership_change_window' then 'Confirmar controlador, sponsor financeiro, motivo da mudança e plano de capital.'
      when 'debt_maturity_refinancing_window' then 'Mapear vencimentos, garantias e covenants; testar debênture/nota comercial ou reperfilamento.'
      when 'capital_structure_change_window' then 'Entender uso dos recursos e necessidade posterior ao evento de capital.'
      when 'related_party_dependency_risk' then 'Validar materialidade, condições, governança e potenciais vazamentos de caixa.'
      when 'innovation_capex_funding_window' then 'Confirmar natureza do apoio, orçamento do projeto, contrapartidas, marcos e necessidade de capital adicional.'
      when 'public_funding_execution_window' then 'Acompanhar liberações, execução física/financeira e próxima necessidade de recursos.' end,
    jsonb_build_object('factorMap',factor_map,'factor',factor_item,'source','signal_factor_map_v1')
  from public.pattern_catalog pattern
  cross join lateral (select value as factor_item from jsonb_array_elements(coalesce(factor_map->'factors','[]'::jsonb))) factor_row
  where pattern.active and (
    (pattern.code='ownership_change_window' and factor_item->>'code'='ownership_change' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='debt_maturity_refinancing_window' and factor_item->>'code'='debt_maturity_concentration' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='capital_structure_change_window' and factor_item->>'code'='capital_cycle_change' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='related_party_dependency_risk' and factor_item->>'code'='related_party_dependency' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='innovation_capex_funding_window' and factor_item->>'code'='innovation_capex_cycle' and coalesce((factor_item->>'score')::numeric,0)>=8) or
    (pattern.code='public_funding_execution_window' and factor_item->>'code'='public_funding_execution' and coalesce((factor_item->>'score')::numeric,0)>=8)
  );
  return null;
end;
$$;

alter function public.get_public_data_operations_snapshot()
  rename to get_public_data_operations_snapshot_pre_finep;

create function public.get_public_data_operations_snapshot()
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
begin
  base_payload:=public.get_public_data_operations_snapshot_pre_finep();

  with source as (
    select id,name,status,health from public.source_catalog where metadata->>'code'='src_finep_financing_operations' limit 1
  ), latest_run as (
    select * from public.public_dataset_runs where dataset_code='finep_financing_operations' order by started_at desc limit 1
  ), lifetime as (
    select count(*)::integer as run_count,
      max(finished_at) filter (where status='completed') as last_successful_run_at
    from public.public_dataset_runs where dataset_code='finep_financing_operations'
  ), checkpoints as (
    select count(*)::integer as checkpoint_count,
      count(*) filter (where status='completed')::integer as completed_checkpoints,
      count(*) filter (where status='failed')::integer as failed_checkpoints,
      count(*) filter (where status='partial')::integer as partial_checkpoints,
      coalesce(sum(rows_scanned),0)::bigint as rows_scanned,
      coalesce(sum(records_matched),0)::bigint as records_matched,
      max(last_checked_at) as last_checked_at
    from public.public_dataset_resource_checkpoints where dataset_code='finep_financing_operations'
  ), records as (
    select count(*)::integer as record_count,
      count(distinct company_id) filter (where company_id is not null)::integer as company_count,
      max(observed_at) as latest_record_at
    from public.public_company_records where dataset_code='finep_financing_operations'
  ), outputs as (
    select count(*)::integer as output_count,max(observed_at) as latest_output_at
    from public.monitoring_outputs where payload->>'datasetCode'='finep_financing_operations'
  ), signals as (
    select count(*)::integer as signal_count,max(observed_at) as latest_signal_at
    from public.company_signals where metadata->>'datasetCode'='finep_financing_operations'
  )
  select jsonb_build_object(
    'datasetCode','finep_financing_operations',
    'sourceCode','src_finep_financing_operations',
    'displayName','Finep · Operações e Desembolsos',
    'sourceId',source.id,'sourceName',source.name,
    'sourceStatus',coalesce(source.status,'partial'),'sourceHealth',coalesce(source.health,'degraded'),
    'cadence','weekly','executionMode','scheduled_github_actions',
    'signalType','public_financing_signal / innovation_disbursement_signal',
    'operationalStatus',case when latest_run.status='running' then 'running' when latest_run.status='completed' then 'healthy'
      when latest_run.status='partial' then 'attention' when latest_run.status='failed' then 'blocked' else 'waiting' end,
    'nextAction',case when latest_run.id is null then 'Executar a primeira carga e validar matches no Company Master.'
      when latest_run.status='failed' then 'Corrigir o workbook/loader e reprocessar.'
      when coalesce(records.record_count,0)=0 then 'Carga sem matches; ampliar o Company Master real e manter a cadência.'
      when coalesce(signals.signal_count,0)=0 then 'Validar outputs, sinais e factor map Finep.'
      else 'Revisar natureza do funding, cronograma de desembolsos, fatores e próxima ação comercial.' end,
    'latestRun',case when latest_run.id is null then null else jsonb_build_object(
      'id',latest_run.id,'triggerType',latest_run.trigger_type,'status',latest_run.status,
      'startedAt',latest_run.started_at,'finishedAt',latest_run.finished_at,
      'resourcesDiscovered',coalesce(latest_run.resources_discovered,0),
      'resourcesProcessed',coalesce(latest_run.resources_processed,0),
      'resourcesSkipped',coalesce(latest_run.resources_skipped,0),
      'rowsScanned',coalesce(latest_run.rows_scanned,0),
      'recordsMatched',coalesce(latest_run.records_matched,0),
      'outputsWritten',coalesce(latest_run.outputs_written,0),
      'signalsWritten',coalesce(latest_run.signals_written,0),
      'fullCoverageRequested',false,'errorMessage',latest_run.error_message) end,
    'lifetime',jsonb_build_object(
      'runCount',coalesce(lifetime.run_count,0),
      'checkpointCount',coalesce(checkpoints.checkpoint_count,0),
      'completedCheckpoints',coalesce(checkpoints.completed_checkpoints,0),
      'failedCheckpoints',coalesce(checkpoints.failed_checkpoints,0),
      'partialCheckpoints',coalesce(checkpoints.partial_checkpoints,0),
      'rowsScanned',coalesce(checkpoints.rows_scanned,0),
      'recordsMatched',coalesce(checkpoints.records_matched,0),
      'recordsPersisted',coalesce(records.record_count,0),
      'matchedCompanyCount',coalesce(records.company_count,0),
      'outputsPersisted',coalesce(outputs.output_count,0),
      'signalsPersisted',coalesce(signals.signal_count,0),
      'lastSuccessfulRunAt',lifetime.last_successful_run_at,
      'lastCheckedAt',checkpoints.last_checked_at,
      'latestRecordAt',records.latest_record_at,
      'latestOutputAt',outputs.latest_output_at,
      'latestSignalAt',signals.latest_signal_at)
  ) into finep_dataset
  from source full join latest_run on true full join lifetime on true full join checkpoints on true
    full join records on true full join outputs on true full join signals on true;

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
    'registeredSources',count(distinct item->>'sourceId') filter (where nullif(item->>'sourceId','') is not null)::integer,
    'targetCompaniesWithValidCnpj',coalesce((base_payload#>>'{summary,targetCompaniesWithValidCnpj}')::integer,0)
  ) into recomputed_summary from jsonb_array_elements(combined_datasets) item;

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
