-- 056_free_source_evidence_guardrails.sql
-- Prevents baseline/archive availability from becoming an artificial score
-- trigger. Score impact is allowed only after an observed material change.

update public.source_treatment_rules
set
  signal_family = 'governance',
  strength_floor = 70,
  confidence_delta = 0.06,
  structural_score_delta = 2,
  timing_score_delta = 5,
  executability_score_delta = 3,
  treatment_policy = '{"output":"company_signals","qualification_use":"compare snapshots; a static registration alone must not change score"}'::jsonb
where source_code = 'src_rfb_cnpj_bulk'
  and signal_type = 'corporate_structure_change';

update public.source_treatment_rules
set
  treatment_policy = '{"output":"company_signals","qualification_use":"apply only after a material content diff; snapshot availability alone must not change score"}'::jsonb
where source_code = 'src_wayback_company_history'
  and signal_type = 'product_expansion_signal';

update public.source_treatment_rules
set
  treatment_policy = '{"output":"company_signals","qualification_use":"apply only after a material content diff and use as corroborating evidence"}'::jsonb
where source_code = 'src_common_crawl_company_history'
  and signal_type = 'product_expansion_signal';

-- Keep explicit operational metadata aligned with the runtime code.
with runtime_state(code, implemented_runtime) as (
  values
    ('src_rfb_cnpj_bulk', false),
    ('src_pgfn_divida_ativa_bulk', false),
    ('src_bndes_financing_operations', false),
    ('src_cgu_transparencia_bulk', false),
    ('src_compras_gov_contracts', false),
    ('src_consumidor_gov_open_data', false),
    ('src_inlabs_dou_xml', false),
    ('src_inpi_ip_open_data', false),
    ('src_bcb_ifdata', false),
    ('src_bcb_complaints_ranking', false),
    ('src_github_public_api', true),
    ('src_bcb_pix_participants', false),
    ('src_transferegov_public_api', false),
    ('src_wayback_company_history', true),
    ('src_common_crawl_company_history', true),
    ('src_datajud_public_api', false),
    ('src_comexstat_open_data', false)
)
update public.source_catalog source
set metadata = coalesce(source.metadata, '{}'::jsonb) || jsonb_build_object(
  'implementedRuntime', runtime.implemented_runtime,
  'implementationPhase', case when runtime.implemented_runtime then 'runtime_active' else 'bulk_loader_required' end,
  'accessCost', 'free',
  'free', true
),
updated_at = now()
from runtime_state runtime
where source.metadata->>'code' = runtime.code;
