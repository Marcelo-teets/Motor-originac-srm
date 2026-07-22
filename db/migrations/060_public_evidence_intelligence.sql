-- Public-data downstream intelligence.
-- Makes official public evidence flow consistently into qualification, patterns,
-- score, ranking, thesis inputs, pipeline gating and due-diligence tasks.

create or replace function public.safe_numeric(p_value text)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when nullif(regexp_replace(coalesce(p_value, ''), '[^0-9,.-]', '', 'g'), '') is null then null
    when regexp_replace(coalesce(p_value, ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]+([.][0-9]+)?$'
      then regexp_replace(coalesce(p_value, ''), '[^0-9.-]', '', 'g')::numeric
    else null
  end;
$$;

insert into public.pattern_catalog (
  code, name, category, description, default_weight, active,
  pattern_name, pattern_family, explicit_features, latent_features,
  default_qualification_impact, default_lead_score_impact, default_ranking_impact,
  updated_at
)
values
  ('public_receivables_fundable','Public receivables with fundable government counterparty','public_data','Contratos públicos aderentes ao CNPJ monitorado criam lastro potencial para cessão, antecipação ou FIDC.',1.15,true,'Public receivables with fundable government counterparty','fidc_fit',array['public_contract_receivables','government_counterparty'],array['cession_eligibility','public_payment_cycle'],8,9,10,now()),
  ('public_funding_refinancing_window','Existing public funding with refinancing window','public_data','Histórico de BNDES/Finep evidencia sofisticação mínima e pode abrir tese de complemento, reperfilamento ou alongamento.',1.00,true,'Existing public funding with refinancing window','capital_structure',array['public_financing_signal'],array['refinancing_window','funding_complement'],3,4,4,now()),
  ('public_fiscal_stress_conditional','Fiscal stress creates conditional funding need','public_data_risk','Dívida ativa pode aumentar urgência de capital, mas exige certidões, materialidade e plano de regularização antes de abordagem padrão.',0.85,true,'Fiscal stress creates conditional funding need','risk',array['fiscal_stress'],array['conditional_funding','tax_regularization'],-4,-7,-6,now()),
  ('public_compliance_red_flag','Compliance red flag blocks standard origination','public_data_risk','CEIS/CNEP ativo ou material bloqueia originação padrão até diligência e validação de status.',0.65,true,'Compliance red flag blocks standard origination','risk',array['legal_compliance_risk'],array['blocked_approach','enhanced_due_diligence'],-12,-18,-24,now()),
  ('public_corporate_change_window','Corporate change creates origination window','public_data','Mudança material de cadastro, capital ou estabelecimento pode indicar reorganização, expansão ou novo ciclo de funding.',0.95,true,'Corporate change creates origination window','timing',array['corporate_structure_change'],array['reorganization','fresh_timing_window'],2,5,5,now())
on conflict (code) do update set
  name=excluded.name, category=excluded.category, description=excluded.description,
  default_weight=excluded.default_weight, active=excluded.active,
  pattern_name=excluded.pattern_name, pattern_family=excluded.pattern_family,
  explicit_features=excluded.explicit_features, latent_features=excluded.latent_features,
  default_qualification_impact=excluded.default_qualification_impact,
  default_lead_score_impact=excluded.default_lead_score_impact,
  default_ranking_impact=excluded.default_ranking_impact, updated_at=now();

create or replace function public.get_company_public_evidence(p_company_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with raw as (
  select
    signal.id,
    signal.signal_type,
    coalesce(signal.signal_strength, signal.strength, 0)::numeric as signal_strength,
    coalesce(signal.confidence_score, signal.confidence / 100.0, 0)::numeric as confidence_score,
    coalesce(signal.observed_at, signal.created_at) as observed_at,
    coalesce(signal.metadata, '{}'::jsonb) || coalesce(signal.evidence_payload, '{}'::jsonb) as payload,
    lower(coalesce(signal.metadata ->> 'status', signal.evidence_payload ->> 'status', signal.evidence_payload #>> '{normalized,status}', '')) as status_text,
    coalesce(public.safe_numeric(signal.metadata ->> 'amount'), public.safe_numeric(signal.evidence_payload ->> 'amount'), public.safe_numeric(signal.evidence_payload #>> '{normalized,amount}'), 0) as amount,
    coalesce(signal.metadata ->> 'datasetCode', signal.evidence_payload ->> 'datasetCode', signal.evidence_payload #>> '{normalized,datasetCode}') as dataset_code,
    coalesce(signal.metadata ->> 'publicRecordKey', signal.evidence_payload ->> 'recordKey', signal.evidence_payload ->> 'publicRecordKey', signal.signal_type || '|' || coalesce(signal.evidence_text, signal.evidence_payload ->> 'summary', signal.id::text)) as evidence_key,
    coalesce(signal.evidence_text, signal.evidence_payload ->> 'summary', signal.signal_label, signal.signal_type) as evidence_text,
    signal.evidence_url
  from public.company_signals signal
  where signal.company_id = p_company_id
    and (
      coalesce(signal.metadata ->> 'datasetCode', signal.evidence_payload ->> 'datasetCode', '') in ('cgu_ceis','cgu_cnep','bndes_financing_operations','compras_contracts','pgfn_debt','rfb_cnpj')
      or signal.signal_type in ('public_contract_receivables','public_financing_signal','fiscal_stress','legal_compliance_risk','corporate_structure_change')
    )
), deduplicated as (
  select distinct on (evidence_key) * from raw order by evidence_key, observed_at desc, confidence_score desc
), metrics as (
  select
    count(*)::integer as public_signal_count,
    count(*) filter (where observed_at >= now() - interval '180 days')::integer as fresh_signal_count,
    count(distinct dataset_code) filter (where dataset_code is not null)::integer as dataset_count,
    count(*) filter (where signal_type = 'public_contract_receivables')::integer as public_contract_count,
    count(*) filter (where signal_type = 'public_financing_signal')::integer as public_financing_count,
    count(*) filter (where signal_type = 'fiscal_stress')::integer as fiscal_count,
    count(*) filter (where signal_type = 'legal_compliance_risk')::integer as compliance_count,
    count(*) filter (where signal_type = 'corporate_structure_change')::integer as corporate_change_count,
    count(*) filter (where signal_type = 'legal_compliance_risk' and status_text ~ '(ativo|ativa|vigente|em vigor|aberto|impedido|sancionado)' and status_text !~ '(encerr|baixad|cancel|expir|regulariz|suspens|inativo)')::integer as active_compliance_count,
    coalesce(sum(amount) filter (where signal_type = 'public_contract_receivables'),0)::numeric as public_contract_amount,
    coalesce(sum(amount) filter (where signal_type = 'public_financing_signal'),0)::numeric as public_financing_amount,
    coalesce(sum(amount) filter (where signal_type = 'fiscal_stress'),0)::numeric as fiscal_amount,
    coalesce(max(signal_strength),0)::numeric as max_strength,
    coalesce(avg(confidence_score),0)::numeric as avg_confidence,
    max(observed_at) as latest_observed_at
  from deduplicated
), scored as (
  select metrics.*,
    least(35, public_contract_count*16 + case when public_contract_amount>=10000000 then 10 when public_contract_amount>=1000000 then 6 when public_contract_amount>0 then 3 else 0 end + public_financing_count*7 + corporate_change_count*5 + least(fresh_signal_count*2,6))::integer as opportunity_score,
    least(45, active_compliance_count*35 + greatest(compliance_count-active_compliance_count,0)*20 + fiscal_count*8 + case when fiscal_amount>=10000000 then 18 when fiscal_amount>=5000000 then 14 when fiscal_amount>=1000000 then 8 when fiscal_amount>0 then 4 else 0 end)::integer as risk_penalty,
    least(1.0,greatest(0.0,(least(dataset_count,4)::numeric/4.0)*0.55 + (least(fresh_signal_count,3)::numeric/3.0)*0.25 + least(avg_confidence,1.0)*0.20))::numeric as evidence_coverage
  from metrics
), classified as (
  select scored.*,
    case when active_compliance_count>0 then 'blocking' when compliance_count>0 or fiscal_amount>=5000000 then 'high' when fiscal_count>0 then 'caution' else 'none' end as risk_level,
    active_compliance_count as blocking_risk_count
  from scored
), strongest_opportunity as (
  select jsonb_build_object('signalType',signal_type,'strength',signal_strength,'amount',amount,'observedAt',observed_at,'summary',evidence_text,'url',evidence_url,'datasetCode',dataset_code) as evidence
  from deduplicated where signal_type in ('public_contract_receivables','public_financing_signal','corporate_structure_change')
  order by case signal_type when 'public_contract_receivables' then 3 when 'public_financing_signal' then 2 else 1 end desc, amount desc, signal_strength desc, observed_at desc limit 1
), strongest_risk as (
  select jsonb_build_object('signalType',signal_type,'strength',signal_strength,'amount',amount,'status',nullif(status_text,''),'observedAt',observed_at,'summary',evidence_text,'url',evidence_url,'datasetCode',dataset_code) as evidence
  from deduplicated where signal_type in ('legal_compliance_risk','fiscal_stress')
  order by case signal_type when 'legal_compliance_risk' then 2 else 1 end desc, amount desc, signal_strength desc, observed_at desc limit 1
)
select jsonb_build_object(
  'version','public_evidence_v1',
  'publicSignalCount',classified.public_signal_count,
  'freshSignalCount',classified.fresh_signal_count,
  'datasetCount',classified.dataset_count,
  'evidenceCoverage',round(classified.evidence_coverage,4),
  'maxSignalStrength',classified.max_strength,
  'avgConfidence',round(classified.avg_confidence,4),
  'latestObservedAt',classified.latest_observed_at,
  'opportunityScore',classified.opportunity_score,
  'riskPenalty',classified.risk_penalty,
  'commercialScoreDelta',classified.opportunity_score-classified.risk_penalty,
  'riskLevel',classified.risk_level,
  'blockingRiskCount',classified.blocking_risk_count,
  'hasPublicContracts',classified.public_contract_count>0,
  'hasPublicFinancing',classified.public_financing_count>0,
  'hasFiscalStress',classified.fiscal_count>0,
  'hasComplianceRisk',classified.compliance_count>0,
  'hasCorporateChange',classified.corporate_change_count>0,
  'amounts',jsonb_build_object('publicContracts',classified.public_contract_amount,'publicFinancing',classified.public_financing_amount,'fiscalDebt',classified.fiscal_amount),
  'strongestOpportunity',(select evidence from strongest_opportunity),
  'strongestRisk',(select evidence from strongest_risk),
  'whyNow',to_jsonb(array_remove(array[
    case when classified.public_contract_count>0 then 'Contrato público identificado: há lastro potencial e janela para validar cessão, prazo e fluxo de pagamento.' end,
    case when classified.public_financing_count>0 then 'Histórico de financiamento público identificado: há ângulo de complemento, alongamento ou reperfilamento.' end,
    case when classified.corporate_change_count>0 then 'Mudança cadastral material identificada: possível reorganização, expansão ou novo ciclo de capital.' end,
    case when classified.fiscal_count>0 then 'Pressão fiscal observada: aumenta a urgência financeira, mas condiciona a executabilidade.' end,
    case when classified.compliance_count>0 then 'Evento de compliance observado: abordagem padrão depende de diligência e validação do status.' end
  ]::text[],null)),
  'dueDiligenceActions',to_jsonb(array_remove(array[
    case when classified.public_contract_count>0 then 'Solicitar contratos, empenhos, cronograma de medição/pagamento, devedor público e cláusulas de cessão.' end,
    case when classified.public_financing_count>0 then 'Mapear saldo, produto, prazo, garantias e covenants do financiamento público.' end,
    case when classified.fiscal_count>0 then 'Obter certidões, detalhar valor/natureza da dívida e validar plano de regularização.' end,
    case when classified.compliance_count>0 then 'Validar esfera, fundamento, vigência, materialidade e situação atual no CEIS/CNEP.' end,
    case when classified.corporate_change_count>0 then 'Confirmar alteração societária/cadastral e seu impacto em controle, capital e operação.' end
  ]::text[],null)),
  'recommendedStructures',to_jsonb(array_remove(array[
    case when classified.public_contract_count>0 then 'FIDC de recebíveis públicos / cessão de contratos' end,
    case when classified.public_financing_count>0 then 'Debênture ou nota comercial para complemento/alongamento' end,
    case when classified.public_contract_count=0 and classified.public_financing_count=0 and classified.corporate_change_count>0 then 'Estrutura condicionada à confirmação do novo ciclo de capital' end
  ]::text[],null)),
  'recommendedStage',case when classified.risk_level in ('blocking','high') then 'Identified' when classified.opportunity_score>=20 and classified.risk_level='none' then 'Approach' when classified.opportunity_score>=8 then 'Qualified' else 'Identified' end,
  'nextAction',case
    when classified.risk_level='blocking' then 'Bloquear abordagem padrão e concluir diligência de compliance CEIS/CNEP.'
    when classified.risk_level='high' and classified.compliance_count>0 then 'Validar sanção e materialidade antes de qualquer abordagem comercial.'
    when classified.fiscal_count>0 then 'Obter certidões e dimensionar a dívida fiscal antes de estruturar a tese.'
    when classified.public_contract_count>0 then 'Validar contrato público, cessibilidade, prazo, devedor e fluxo elegível para FIDC.'
    when classified.public_financing_count>0 then 'Mapear saldo e condições do funding público para desenhar complemento ou reperfilamento.'
    when classified.corporate_change_count>0 then 'Confirmar a mudança societária/cadastral e identificar o sponsor financeiro.'
    else 'Revisar a evidência pública e confirmar materialidade com o time de originação.' end
)
from classified;
$$;

grant execute on function public.get_company_public_evidence(uuid) to service_role;
revoke execute on function public.get_company_public_evidence(uuid) from anon, authenticated;
