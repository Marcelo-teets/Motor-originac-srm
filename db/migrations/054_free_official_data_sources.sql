-- 054_free_official_data_sources.sql
-- Registers free public sources without adding a parallel stack. Lightweight
-- APIs run in company monitoring; national bulk datasets stay partial until
-- their streaming loaders persist normalized rows outside the Vercel request.

with source_seed (
  code, name, source_type, category, auth_requirement, status, health,
  base_url, capture_mode, refresh_frequency, entity_key, rate_limit_notes
) as (
  values
    ('src_rfb_cnpj_bulk', 'Receita Federal CNPJ aberto completo', 'bulk_zip', 'cadastral', 'none', 'partial', 'healthy', 'https://arquivos.receitafederal.gov.br/cnpj/dados_abertos_cnpj/', 'official_bulk_snapshot', 'monthly', 'cnpj', 'Arquivos nacionais grandes; usar download streaming, hash e staging.'),
    ('src_pgfn_divida_ativa_bulk', 'PGFN Dívida Ativa da União', 'bulk_csv', 'fiscal_risk', 'none', 'partial', 'healthy', 'https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos', 'official_bulk_snapshot', 'quarterly', 'cnpj', 'Arquivos por sistema e UF; ausência não representa regularidade fiscal.'),
    ('src_bndes_financing_operations', 'BNDES Operações de Financiamento', 'ckan_csv', 'capital_structure', 'none', 'partial', 'healthy', 'https://dadosabertos.bndes.gov.br/dataset/operacoes-financiamento', 'official_ckan_resources', 'monthly', 'cnpj', 'Descobrir recursos via CKAN package_show e ingerir CSV em lote.'),
    ('src_cgu_transparencia_bulk', 'Portal da Transparência downloads completos', 'bulk_csv', 'compliance_public_sector', 'none', 'partial', 'healthy', 'https://portaldatransparencia.gov.br/download-de-dados', 'official_bulk_snapshot', 'daily_or_monthly', 'cnpj', 'Separar sanções, contratos, pagamentos e licitações em sinais distintos.'),
    ('src_compras_gov_contracts', 'Compras.gov.br dados abertos', 'api_csv', 'public_procurement_receivables', 'none', 'partial', 'degraded', 'https://dadosabertos.compras.gov.br/', 'official_rest_with_csv_fallback', 'daily', 'cnpj', 'API de contratos pode oscilar; usar CSV oficial e PNCP como fallback.'),
    ('src_consumidor_gov_open_data', 'Consumidor.gov.br dados abertos', 'bulk_csv', 'asset_quality', 'none', 'partial', 'healthy', 'https://consumidor.gov.br/pages/indicador/geral/abrir', 'official_bulk_snapshot', 'periodic', 'company_name', 'Ausência da empresa não deve ser interpretada como sinal positivo.'),
    ('src_inlabs_dou_xml', 'INLABS Diário Oficial da União XML', 'xml', 'regulatory', 'free_registration', 'partial', 'healthy', 'https://inlabs.in.gov.br/', 'official_xml_daily_edition', 'daily', 'cnpj_or_name', 'Cadastro gratuito; armazenar apenas trechos e metadados relevantes.'),
    ('src_inpi_ip_open_data', 'INPI BADEPI e dados abertos de PI', 'bulk_zip', 'product_innovation', 'none', 'partial', 'healthy', 'https://www.gov.br/inpi/pt-br/inpi-data/dados-e-series-temporais/badepi', 'official_bulk_snapshot', 'annual_and_periodic', 'company_name', 'Matching por titular normalizado exige revisão de entidades.'),
    ('src_bcb_ifdata', 'Banco Central IF.data', 'dataset_api', 'regulated_financials', 'none', 'partial', 'healthy', 'https://www3.bcb.gov.br/ifdata/', 'official_financial_dataset', 'quarterly', 'regulated_entity', 'Usar apenas para instituições reguladas com match confirmado.'),
    ('src_bcb_complaints_ranking', 'BCB Ranking de Reclamações', 'dataset_api', 'asset_quality', 'none', 'partial', 'healthy', 'https://dadosabertos.bcb.gov.br/dataset/ranking-de-instituicoes-por-indice-de-reclamacoes', 'official_dataset_api', 'periodic', 'regulated_entity', 'Normalizar conglomerado e instituição antes de comparar séries.'),
    ('src_github_public_api', 'GitHub API pública', 'api', 'technical_product_signal', 'none', 'real', 'healthy', 'https://api.github.com/search/repositories', 'public_search_api', 'per_monitoring_run', 'domain_or_name', 'Sem token: limite público reduzido; GITHUB_TOKEN gratuito é opcional.'),
    ('src_bcb_pix_participants', 'Banco Central Participantes Pix', 'dataset_http', 'embedded_finance', 'none', 'partial', 'healthy', 'https://www.bcb.gov.br/estabilidadefinanceira/participantespix', 'official_participant_list', 'periodic', 'cnpj_or_name', 'Corroborar com Open Finance e registros do BCB.'),
    ('src_transferegov_public_api', 'Transferegov API de dados abertos', 'api', 'public_procurement_receivables', 'none', 'partial', 'healthy', 'https://www.gov.br/transferegov/pt-br/ferramentas-gestao/api-de-dados-abertos-transferegov.br', 'official_rest_api', 'daily', 'cnpj', 'Capturar instrumentos, cronograma e pagamentos sem inferir cessibilidade.'),
    ('src_wayback_company_history', 'Internet Archive Wayback CDX', 'api', 'website_monitoring', 'none', 'real', 'healthy', 'https://web.archive.org/cdx/search/cdx', 'public_history_api', 'weekly', 'domain', 'Uma consulta por domínio; comparar snapshots apenas quando houver hash distinto.'),
    ('src_common_crawl_company_history', 'Common Crawl Index API', 'api', 'website_monitoring', 'none', 'real', 'healthy', 'https://index.commoncrawl.org/collinfo.json', 'public_index_api', 'monthly', 'domain', 'Usar índice mais recente e limitar capturas por execução.'),
    ('src_datajud_public_api', 'CNJ DataJud API pública', 'api', 'judicial_risk', 'public_key', 'partial', 'healthy', 'https://datajud-wiki.cnj.jus.br/api-publica/', 'official_case_api', 'event_driven', 'process_number', 'Usar para atualizar processo conhecido; não presumir busca completa por CNPJ.'),
    ('src_comexstat_open_data', 'ComexStat dados abertos', 'bulk_csv', 'international_receivables', 'none', 'partial', 'healthy', 'https://www.gov.br/mdic/pt-br/assuntos/comercio-exterior/estatisticas/base-de-dados-bruta', 'official_bulk_snapshot', 'monthly', 'sector_or_municipality', 'Contexto setorial; não atribuir exportação individual sem evidência empresarial.')
)
insert into public.source_catalog (
  name, source_type, category, auth_requirement, status, metadata,
  rate_limit_notes, health
)
select
  seed.name,
  seed.source_type,
  seed.category,
  seed.auth_requirement,
  seed.status,
  jsonb_build_object(
    'code', seed.code,
    'provider', split_part(seed.code, '_', 2),
    'baseUrl', seed.base_url,
    'captureMode', seed.capture_mode,
    'refreshFrequency', seed.refresh_frequency,
    'entityKey', seed.entity_key,
    'accessCost', 'free',
    'official', seed.code not in ('src_github_public_api', 'src_wayback_company_history', 'src_common_crawl_company_history'),
    'implementationPhase', case when seed.status = 'real' then 'runtime_active' else 'bulk_loader_required' end
  ),
  seed.rate_limit_notes,
  seed.health
from source_seed seed
where not exists (
  select 1
  from public.source_catalog existing
  where existing.metadata->>'code' = seed.code
);

insert into public.source_treatment_rules (
  source_code, signal_type, signal_family, strength_floor, confidence_delta,
  structural_score_delta, timing_score_delta, executability_score_delta,
  pattern_tags, treatment_policy
)
values
  ('src_rfb_cnpj_bulk', 'corporate_structure_change', 'governance', 70, 0.06, 2, 5, 3, array['governance_signal','timing_trigger'],
   '{"output":"company_signals","qualification_use":"compare snapshots; a static registration alone must not change score"}'::jsonb),
  ('src_pgfn_divida_ativa_bulk', 'fiscal_stress', 'risk', 82, -0.06, 0, 4, -8, array['capital_mismatch','risk_signal'],
   '{"output":"company_signals","qualification_use":"weight amount, age, status, guarantee and negotiation; never auto-reject"}'::jsonb),
  ('src_bndes_financing_operations', 'public_financing_signal', 'capital_structure', 76, 0.05, 5, 4, 5, array['capital_structure','funding_gap'],
   '{"output":"company_signals","qualification_use":"supports funding history, refinancing window and comparables"}'::jsonb),
  ('src_cgu_transparencia_bulk', 'legal_compliance_risk', 'risk', 84, -0.08, 0, 4, -10, array['risk_signal'],
   '{"output":"company_signals","qualification_use":"separate sanctions from public payment and contract opportunities"}'::jsonb),
  ('src_compras_gov_contracts', 'public_contract_receivables', 'receivables', 82, 0.07, 9, 5, 6, array['receivables_strong','funding_gap'],
   '{"output":"company_signals","qualification_use":"validate contract, payment term, debtor, concentration and assignment feasibility"}'::jsonb),
  ('src_consumidor_gov_open_data', 'demand_quality_risk', 'asset_quality', 73, -0.03, 0, 3, -4, array['receivables_quality','risk_signal'],
   '{"output":"company_signals","qualification_use":"trend and denominator matter; absence is not a positive signal"}'::jsonb),
  ('src_inlabs_dou_xml', 'regulatory_event', 'timing', 78, 0.04, 3, 8, 4, array['timing_trigger','governance_signal'],
   '{"output":"company_signals","qualification_use":"human review required for materiality and company identity"}'::jsonb),
  ('src_inpi_ip_open_data', 'product_expansion_signal', 'expansion', 66, 0.03, 2, 5, 2, array['expansion','timing_trigger'],
   '{"output":"company_signals","qualification_use":"corroborate owner identity and relation to financial product"}'::jsonb),
  ('src_bcb_ifdata', 'financial_infrastructure_signal', 'embedded_finance', 80, 0.07, 8, 5, 7, array['embedded_finance_pressure','credit_is_core'],
   '{"output":"company_signals","qualification_use":"only exact regulated-entity matches are authoritative"}'::jsonb),
  ('src_bcb_complaints_ranking', 'demand_quality_risk', 'asset_quality', 73, -0.04, 0, 4, -5, array['receivables_quality','risk_signal'],
   '{"output":"company_signals","qualification_use":"compare index, complaint mix and customer denominator over time"}'::jsonb),
  ('src_github_public_api', 'technical_product_signal', 'product', 70, 0.04, 4, 5, 2, array['product_launch','embedded_finance_pressure'],
   '{"output":"company_signals","qualification_use":"public repository must correlate by domain/name; activity supports timing"}'::jsonb),
  ('src_bcb_pix_participants', 'financial_infrastructure_signal', 'embedded_finance', 80, 0.07, 8, 4, 7, array['embedded_finance_pressure','credit_is_core'],
   '{"output":"company_signals","qualification_use":"confirm participant modality and legal entity"}'::jsonb),
  ('src_transferegov_public_api', 'public_contract_receivables', 'receivables', 78, 0.05, 6, 5, 4, array['receivables_strong','funding_gap'],
   '{"output":"company_signals","qualification_use":"instrument and disbursement do not automatically imply assignable receivable"}'::jsonb),
  ('src_wayback_company_history', 'product_expansion_signal', 'expansion', 66, 0.03, 2, 5, 1, array['expansion','timing_trigger'],
   '{"output":"company_signals","qualification_use":"snapshot availability is only a trigger for content comparison"}'::jsonb),
  ('src_common_crawl_company_history', 'product_expansion_signal', 'expansion', 65, 0.02, 1, 4, 1, array['expansion','timing_trigger'],
   '{"output":"company_signals","qualification_use":"use as corroborating history; do not infer launch from capture count alone"}'::jsonb),
  ('src_datajud_public_api', 'judicial_stress', 'risk', 90, -0.12, 0, 8, -18, array['distress','risk_signal'],
   '{"output":"company_signals","qualification_use":"process number, party role, amount and current status require validation"}'::jsonb),
  ('src_comexstat_open_data', 'international_receivables_signal', 'receivables', 65, 0.02, 3, 2, 2, array['receivables_strong','capital_mismatch'],
   '{"output":"company_signals","qualification_use":"sector context only unless company-level export evidence exists"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
