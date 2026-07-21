-- 053_reconcile_bcb_vc_source_foundation.sql
-- Reconciles live environments where migration 022 did not seed the canonical
-- BCB SGS and VC portfolio sources because source_catalog.id moved to UUID.

insert into public.source_catalog (
  name, source_type, category, auth_requirement, status, metadata,
  rate_limit_notes, health
)
select
  'Banco Central SGS Macro Series',
  'api',
  'macro_context',
  'none',
  'real',
  jsonb_build_object(
    'code', 'src_bcb_sgs',
    'provider', 'bcb_sgs',
    'baseUrl', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs',
    'captureMode', 'official_series_api',
    'series', jsonb_build_array(
      jsonb_build_object('code', 432, 'name', 'Selic meta', 'unit', '% a.a.'),
      jsonb_build_object('code', 12, 'name', 'CDI diário', 'unit', '% a.d.'),
      jsonb_build_object('code', 433, 'name', 'IPCA mensal', 'unit', '% a.m.'),
      jsonb_build_object('code', 189, 'name', 'IGP-M mensal', 'unit', '% a.m.'),
      jsonb_build_object('code', 1, 'name', 'Dólar comercial (venda)', 'unit', 'BRL')
    )
  ),
  'API pública; uma coleta por série por execução.',
  'healthy'
where not exists (
  select 1 from public.source_catalog where metadata->>'code' = 'src_bcb_sgs'
);

insert into public.source_catalog (
  name, source_type, category, auth_requirement, status, metadata,
  rate_limit_notes, health
)
select
  'VC Portfolio Monitor Brasil',
  'website',
  'vc_portfolio',
  'none',
  'real',
  jsonb_build_object(
    'code', 'src_vc_portfolio_monitor',
    'provider', 'first_party_portfolio_pages',
    'captureMode', 'public_portfolio_pages',
    'portfolios', jsonb_build_array(
      jsonb_build_object('fund', 'Kaszek', 'url', 'https://www.kaszek.com/companies'),
      jsonb_build_object('fund', 'Monashees', 'url', 'https://monashees.com.br/en/portfolio'),
      jsonb_build_object('fund', 'Canary', 'url', 'https://canary.com.br/portfolio'),
      jsonb_build_object('fund', 'Astella', 'url', 'https://www.astella.com.br/portfolio'),
      jsonb_build_object('fund', 'Valor Capital Group', 'url', 'https://valorcapitalgroup.com/portfolio')
    )
  ),
  'Uma leitura por fundo por execução; cache e backoff obrigatórios.',
  'healthy'
where not exists (
  select 1 from public.source_catalog where metadata->>'code' = 'src_vc_portfolio_monitor'
);

insert into public.source_treatment_rules (
  source_code, signal_type, signal_family, strength_floor, confidence_delta,
  structural_score_delta, timing_score_delta, executability_score_delta,
  pattern_tags, treatment_policy
)
values
  ('src_bcb_sgs','macro_indexer_context','timing',50,0.02,0,2,1,array['timing_trigger'],
   '{"output":"company_signals","qualification_use":"macro context only; must not dominate score without company-level corroboration"}'::jsonb),
  ('src_vc_portfolio_monitor','venture_backed','growth',74,0.05,3,6,4,array['growth_without_funding','expansion_outpacing_capital'],
   '{"output":"company_signals","qualification_use":"venture backing confirms institutional support; corroborate with funding-round recency"}'::jsonb),
  ('src_pncp_contracts_api','public_contract_receivables','receivables',82,0.07,9,5,6,array['receivables_strong','funding_gap'],
   '{"output":"company_signals","qualification_use":"validate payment term and assignment feasibility"}'::jsonb),
  ('src_querido_diario_api','regulatory_event','timing',66,0.03,2,6,2,array['timing_trigger','governance_signal'],
   '{"output":"company_signals","qualification_use":"requires human review of the official excerpt"}'::jsonb),
  ('src_open_finance_participants_api','financial_infrastructure_signal','embedded_finance',80,0.07,9,4,6,array['embedded_finance_pressure','credit_is_core'],
   '{"output":"company_signals","qualification_use":"exact CNPJ match is authoritative"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
