-- 055_reconcile_free_official_source_registry.sql
-- Keeps GitHub and Supabase aligned after the free-source activation.
-- Idempotent: updates canonical source state and upserts every treatment rule.

with source_state(code,status,health,implemented_runtime) as (
  values
  ('src_rfb_cnpj_bulk','partial','degraded',false),
  ('src_pgfn_divida_ativa_bulk','partial','degraded',false),
  ('src_bndes_financing_operations','partial','degraded',false),
  ('src_cgu_transparencia_bulk','partial','degraded',false),
  ('src_compras_gov_contracts','partial','degraded',false),
  ('src_consumidor_gov_open_data','partial','degraded',false),
  ('src_inlabs_dou_xml','partial','degraded',false),
  ('src_inpi_ip_open_data','partial','degraded',false),
  ('src_bcb_ifdata','partial','degraded',false),
  ('src_bcb_complaints_ranking','partial','degraded',false),
  ('src_github_public_api','real','healthy',true),
  ('src_bcb_pix_participants','partial','degraded',false),
  ('src_transferegov_public_api','partial','degraded',false),
  ('src_wayback_company_history','real','healthy',true),
  ('src_common_crawl_company_history','real','healthy',true),
  ('src_datajud_public_api','partial','degraded',false),
  ('src_comexstat_open_data','partial','degraded',false)
)
update public.source_catalog sc
set status = s.status,
    health = s.health,
    metadata = coalesce(sc.metadata, '{}'::jsonb) || jsonb_build_object(
      'code', s.code,
      'implementedRuntime', s.implemented_runtime,
      'free', true
    ),
    updated_at = now()
from source_state s
where sc.metadata->>'code' = s.code;

-- The first activation briefly registered the generic regulatory_event rule for
-- Receita Federal. Corporate structure change is the canonical, more precise
-- signal for snapshot comparisons.
delete from public.source_treatment_rules
where source_code = 'src_rfb_cnpj_bulk'
  and signal_type = 'regulatory_event';

insert into public.source_treatment_rules(
  source_code,signal_type,signal_family,strength_floor,confidence_delta,
  structural_score_delta,timing_score_delta,executability_score_delta,
  pattern_tags,treatment_policy
)
values
  ('src_rfb_cnpj_bulk','corporate_structure_change','corporate_structure',70,0.08,4,4,5,array['governance_signal','timing_trigger'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_pgfn_divida_ativa_bulk','fiscal_stress','risk',82,-0.06,0,4,-8,array['capital_mismatch','risk_signal'],jsonb_build_object('output','company_signals','risk_disposition','caution')),
  ('src_bndes_financing_operations','public_financing_signal','capital_structure',76,0.06,6,4,5,array['capital_structure','funding_gap'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_cgu_transparencia_bulk','legal_compliance_risk','risk',84,-0.08,0,4,-10,array['risk_signal'],jsonb_build_object('output','company_signals','risk_disposition','red_flag')),
  ('src_cgu_transparencia_bulk','public_contract_receivables','receivables',82,0.07,8,5,6,array['receivables_strong','funding_gap'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_compras_gov_contracts','public_contract_receivables','receivables',82,0.07,9,5,6,array['receivables_strong','funding_gap'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_consumidor_gov_open_data','demand_quality_risk','asset_quality',73,-0.04,0,3,-5,array['receivables_quality','risk_signal'],jsonb_build_object('output','company_signals','risk_disposition','caution')),
  ('src_inlabs_dou_xml','regulatory_event','timing',78,0.05,3,8,4,array['timing_trigger','governance_signal'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_inpi_ip_open_data','product_expansion_signal','expansion',66,0.03,2,5,2,array['expansion','timing_trigger'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_bcb_ifdata','financial_infrastructure_signal','embedded_finance',80,0.08,8,4,6,array['embedded_finance_pressure','credit_is_core'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_bcb_complaints_ranking','demand_quality_risk','asset_quality',73,-0.04,0,3,-5,array['receivables_quality','risk_signal'],jsonb_build_object('output','company_signals','risk_disposition','caution')),
  ('src_github_public_api','technical_product_signal','product',70,0.04,4,5,3,array['product_launch','embedded_finance_pressure'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_bcb_pix_participants','financial_infrastructure_signal','embedded_finance',80,0.07,7,4,6,array['embedded_finance_pressure','credit_is_core'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_transferegov_public_api','public_contract_receivables','receivables',78,0.05,7,5,5,array['receivables_strong','funding_gap'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_wayback_company_history','product_expansion_signal','expansion',66,0.03,2,5,2,array['expansion','timing_trigger'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_common_crawl_company_history','product_expansion_signal','expansion',66,0.02,2,4,1,array['expansion','timing_trigger'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
  ('src_datajud_public_api','judicial_stress','risk',95,-0.15,0,10,-20,array['distress','risk_signal'],jsonb_build_object('output','company_signals','risk_disposition','red_flag')),
  ('src_comexstat_open_data','international_receivables_signal','receivables',70,0.02,3,2,2,array['receivables_strong','capital_mismatch'],jsonb_build_object('output','company_signals','risk_disposition','positive'))
on conflict(source_code,signal_type) do update set
  signal_family=excluded.signal_family,
  strength_floor=excluded.strength_floor,
  confidence_delta=excluded.confidence_delta,
  structural_score_delta=excluded.structural_score_delta,
  timing_score_delta=excluded.timing_score_delta,
  executability_score_delta=excluded.executability_score_delta,
  pattern_tags=excluded.pattern_tags,
  treatment_policy=excluded.treatment_policy;
