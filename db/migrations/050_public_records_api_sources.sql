-- 050_public_records_api_sources.sql
-- Registers official public-records API sources (PNCP contracts search and
-- Querido Diário municipal gazettes) following the master-brain guardrail:
-- official APIs before RSS dorks or scraping.
-- The existing src_pncp_public_contracts_rss dork (migration 029) is kept as
-- corroboration; this API source is the primary evidence path.
-- Live schema note: source_catalog.id is UUID; metadata->>'code' is the key.

insert into public.source_catalog (name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
select v.name, v.source_type, v.category, v.auth_requirement, v.status,
       jsonb_build_object('code', v.code, 'provider', v.provider, 'baseUrl', v.base_url, 'captureMode', v.capture_mode, 'notes', v.notes),
       v.rate_limit_notes, v.health
from (values
  ('src_pncp_contracts_api','PNCP Contratos Públicos (API oficial)','api','public_procurement_receivables','none','real','pncp','https://pncp.gov.br/api/search/','official_search_api','Busca oficial de contratos públicos por CNPJ/razão social do fornecedor; evidência primária de recebíveis contra ente público.','API pública sem chave; 1 consulta por empresa por execução.','healthy'),
  ('src_querido_diario_api','Querido Diário (diários oficiais municipais)','api','Regulatório','none','real','querido_diario','https://queridodiario.ok.org.br/api/gazettes','official_search_api','Busca de menções da empresa em diários oficiais municipais (Open Knowledge Brasil).','API pública sem chave; 1 consulta por empresa por execução.','healthy')
) as v(code, name, source_type, category, auth_requirement, status, provider, base_url, capture_mode, notes, rate_limit_notes, health)
where not exists (
  select 1 from public.source_catalog sc where sc.metadata->>'code' = v.code
);

insert into public.source_treatment_rules (
  source_code,
  signal_type,
  signal_family,
  strength_floor,
  confidence_delta,
  structural_score_delta,
  timing_score_delta,
  executability_score_delta,
  pattern_tags,
  treatment_policy
)
values
  ('src_pncp_contracts_api','public_contract_receivables','receivables',82,0.07,9,5,6,array['receivables_strong','funding_gap'],'{"output":"company_signals","qualification_use":"has_receivables=true when official contract confirms public debtor; validate payment term and assignment feasibility"}'::jsonb),
  ('src_querido_diario_api','regulatory_event','timing',66,0.03,2,6,2,array['timing_trigger','governance_signal'],'{"output":"company_signals","qualification_use":"timing up when gazette mention is recent and material; requires human read of excerpt"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
