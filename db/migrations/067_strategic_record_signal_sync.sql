create or replace function public.sync_strategic_dataset_company_signals(p_dataset_code text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  signals_count integer:=0;
  qsa_change_count integer:=0;
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
      when 'rfb_partner_snapshot' then 'ownership_structure_signal'
      when 'cvm_fre_debt_profile' then 'debt_maturity_pressure'
      when 'cvm_fre_obligation_schedule' then 'debt_maturity_pressure'
      when 'cvm_fre_capital_increase' then 'capital_structure_change'
      when 'cvm_fre_capital_reduction' then 'capital_structure_change'
      when 'cvm_fre_related_party_transaction' then 'related_party_dependency'
      when 'cvm_fre_ownership_position' then 'ownership_structure_signal'
      when 'cvm_fre_capital_distribution' then 'market_access_signal' end,
    case record.record_type
      when 'rfb_partner_snapshot' then 'Quadro societário oficial identificado'
      when 'cvm_fre_debt_profile' then 'Perfil de endividamento no FRE'
      when 'cvm_fre_obligation_schedule' then 'Obrigação financeira no FRE'
      when 'cvm_fre_capital_increase' then 'Aumento de capital no FRE'
      when 'cvm_fre_capital_reduction' then 'Redução de capital no FRE'
      when 'cvm_fre_related_party_transaction' then 'Transação com parte relacionada no FRE'
      when 'cvm_fre_ownership_position' then 'Posição acionária no FRE'
      when 'cvm_fre_capital_distribution' then 'Distribuição de capital no FRE' end,
    case record.record_type
      when 'rfb_partner_snapshot' then 68 when 'cvm_fre_debt_profile' then 84
      when 'cvm_fre_obligation_schedule' then 90 when 'cvm_fre_capital_increase' then 80
      when 'cvm_fre_capital_reduction' then 84 when 'cvm_fre_related_party_transaction' then 82
      when 'cvm_fre_ownership_position' then 72 when 'cvm_fre_capital_distribution' then 74 end,
    96,true,record.source_url,
    coalesce(record.normalized_payload->>'summary',replace(record.record_type,'_',' ')),
    record.observed_at,
    jsonb_build_object(
      'publicRecordKey',record.record_key,'datasetCode',record.dataset_code,
      'sourceCode',record.source_code,'recordType',record.record_type,
      'entityCnpj',record.entity_cnpj,'referenceDate',record.reference_date,
      'amount',record.amount,'status',record.status
    ),
    case record.record_type
      when 'rfb_partner_snapshot' then 68 when 'cvm_fre_debt_profile' then 84
      when 'cvm_fre_obligation_schedule' then 90 when 'cvm_fre_capital_increase' then 80
      when 'cvm_fre_capital_reduction' then 84 when 'cvm_fre_related_party_transaction' then 82
      when 'cvm_fre_ownership_position' then 72 when 'cvm_fre_capital_distribution' then 74 end,
    0.96,
    jsonb_build_object(
      'label',replace(record.record_type,'_',' '),
      'summary',coalesce(record.normalized_payload->>'summary',record.record_type),
      'sourceUrl',record.source_url,'datasetCode',record.dataset_code,
      'recordKey',record.record_key,'normalized',record.normalized_payload
    ),
    'observed',now(),now()
  from public.public_company_records record
  left join public.source_catalog source on source.metadata->>'code'=record.source_code
  left join public.monitoring_outputs output
    on output.company_id=record.company_id
   and output.source_id is not distinct from source.id
   and output.payload->>'publicRecordKey'=record.record_key
  where record.company_id is not null
    and record.record_type in (
      'rfb_partner_snapshot','cvm_fre_debt_profile','cvm_fre_obligation_schedule',
      'cvm_fre_capital_increase','cvm_fre_capital_reduction',
      'cvm_fre_related_party_transaction','cvm_fre_ownership_position',
      'cvm_fre_capital_distribution'
    )
    and (p_dataset_code is null or record.dataset_code=p_dataset_code)
  on conflict do nothing;
  get diagnostics signals_count=row_count;

  with competencies as (
    select company_id,max(reference_date) as latest_date,
      (array_agg(distinct reference_date order by reference_date desc))[2] as previous_date
    from public.public_company_records
    where dataset_code='rfb_qsa' and record_type='rfb_partner_snapshot'
      and company_id is not null and reference_date is not null
    group by company_id
  ), latest as (
    select record.* from public.public_company_records record
    join competencies competency on competency.company_id=record.company_id and competency.latest_date=record.reference_date
    where record.dataset_code='rfb_qsa' and record.record_type='rfb_partner_snapshot'
  ), previous as (
    select record.* from public.public_company_records record
    join competencies competency on competency.company_id=record.company_id and competency.previous_date=record.reference_date
    where record.dataset_code='rfb_qsa' and record.record_type='rfb_partner_snapshot'
  ), changes as (
    select latest.company_id,latest.source_code,latest.source_url,latest.record_key,
      latest.reference_date,latest.normalized_payload,'added'::text as change_direction
    from latest
    left join previous on previous.company_id=latest.company_id
      and previous.normalized_payload->>'partnerDocumentHash'=latest.normalized_payload->>'partnerDocumentHash'
      and coalesce(previous.normalized_payload->>'qualificationCode','')=coalesce(latest.normalized_payload->>'qualificationCode','')
    where previous.id is null
    union all
    select previous.company_id,previous.source_code,previous.source_url,previous.record_key,
      competency.latest_date,previous.normalized_payload,'removed'::text
    from previous join competencies competency on competency.company_id=previous.company_id
    left join latest on latest.company_id=previous.company_id
      and latest.normalized_payload->>'partnerDocumentHash'=previous.normalized_payload->>'partnerDocumentHash'
      and coalesce(latest.normalized_payload->>'qualificationCode','')=coalesce(previous.normalized_payload->>'qualificationCode','')
    where latest.id is null
  )
  insert into public.company_signals (
    id,company_id,source_id,monitoring_output_id,signal_type,signal_label,
    strength,confidence,is_explicit,evidence_url,evidence_text,observed_at,
    metadata,signal_strength,confidence_score,evidence_payload,
    observed_vs_inferred,created_at,updated_at
  )
  select gen_random_uuid(),change.company_id,source.id,null,'ownership_change',
    case change.change_direction when 'added' then 'Entrada/mudança societária identificada' else 'Saída societária identificada' end,
    86,96,true,change.source_url,
    concat(case change.change_direction when 'added' then 'Entrada/mudança de sócio: ' else 'Saída de sócio: ' end,
      coalesce(change.normalized_payload->>'partnerName','não identificado')),
    now(),
    jsonb_build_object(
      'publicRecordKey',concat('rfb-qsa-change:',md5(change.company_id::text||'|'||change.reference_date::text||'|'||coalesce(change.normalized_payload->>'partnerDocumentHash','')||'|'||change.change_direction)),
      'datasetCode','rfb_qsa','sourceCode',change.source_code,
      'recordType','rfb_partner_change','referenceDate',change.reference_date,
      'changeDirection',change.change_direction,
      'partnerDocumentHash',change.normalized_payload->>'partnerDocumentHash'
    ),
    86,0.96,
    jsonb_build_object(
      'label','Mudança societária RFB',
      'summary',concat(change.change_direction,' · ',coalesce(change.normalized_payload->>'partnerName','sócio não identificado')),
      'sourceUrl',change.source_url,'datasetCode','rfb_qsa','normalized',change.normalized_payload
    ),
    'observed',now(),now()
  from changes change
  left join public.source_catalog source on source.metadata->>'code'=change.source_code
  where p_dataset_code is null or p_dataset_code='rfb_qsa'
  on conflict do nothing;
  get diagnostics qsa_change_count=row_count;
  signals_count:=signals_count+qsa_change_count;
  return jsonb_build_object('signals_written',signals_count,'qsa_changes_written',qsa_change_count);
end;
$$;

revoke all on function public.sync_strategic_dataset_company_signals(text) from public;
grant execute on function public.sync_strategic_dataset_company_signals(text) to service_role;
