-- 054_register_free_official_data_sources.sql
-- Free public sources for origination. Bulk sources remain partial until their
-- streaming company-level loaders are activated.

with source_rows(code,name,url,category,source_type,status,health,priority,frequency,provider,capture_mode,entity_key,access_mode,implemented_runtime) as (
  values
    ('src_rfb_cnpj_bulk','Receita Federal CNPJ Dados Abertos','https://arquivos.receitafederal.gov.br/cnpj/dados_abertos_cnpj/','cadastral','bulk_zip','partial','degraded',1,'monthly','receita_federal','bulk_snapshot','cnpj','anonymous',false),
    ('src_pgfn_divida_ativa_bulk','PGFN Dívida Ativa da União','https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos','fiscal_risk','bulk_csv','partial','degraded',1,'quarterly','pgfn','bulk_snapshot','cnpj_root','anonymous',false),
    ('src_bndes_financing_operations','BNDES Operações de Financiamento','https://dadosabertos.bndes.gov.br/dataset/operacoes-financiamento','capital_structure','ckan_csv','partial','degraded',1,'monthly','bndes','ckan_resource','cnpj','anonymous',false),
    ('src_cgu_transparencia_bulk','CGU Portal da Transparência Downloads','https://portaldatransparencia.gov.br/download-de-dados/','compliance_public_sector','bulk_csv','partial','degraded',1,'monthly','cgu','bulk_snapshot','cnpj','anonymous',false),
    ('src_compras_gov_contracts','Compras.gov.br Contratos e Fornecedores','https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos/portal-de-dados-abertos','public_procurement_receivables','api_csv','partial','degraded',1,'weekly','compras_gov','api_with_csv_fallback','cnpj','anonymous',false),
    ('src_consumidor_gov_open_data','Consumidor.gov.br Dados Abertos','https://www.consumidor.gov.br/pages/dadosabertos/externo/','asset_quality','bulk_csv','partial','degraded',1,'monthly','consumidor_gov','bulk_snapshot','company_name','anonymous',false),
    ('src_inlabs_dou_xml','INLABS Diário Oficial da União XML','https://inlabs.in.gov.br/','regulatory','xml','partial','degraded',2,'daily','imprensa_nacional','registered_xml_download','cnpj_or_name','free_registration',false),
    ('src_inpi_ip_open_data','INPI Propriedade Industrial Dados Abertos','https://www.gov.br/inpi/pt-br/acesso-a-informacao/dados-abertos','product_innovation','bulk_zip','partial','degraded',2,'weekly','inpi','bulk_publication','cnpj_or_name','anonymous',false),
    ('src_bcb_ifdata','Banco Central IF.data','https://www3.bcb.gov.br/ifdata/','regulated_financials','dataset_api','partial','degraded',2,'quarterly','bcb','official_dataset','cnpj','anonymous',false),
    ('src_bcb_complaints_ranking','Banco Central Ranking de Reclamações','https://dadosabertos.bcb.gov.br/dataset/ranking-de-instituicoes-por-indice-de-reclamacoes','asset_quality','dataset_api','partial','degraded',2,'quarterly','bcb','official_dataset','regulated_entity','anonymous',false),
    ('src_github_public_api','GitHub Public API','https://api.github.com/search/repositories','digital_signal','api','real','healthy',2,'weekly','github','company_runtime_api','domain','anonymous_optional_token',true),
    ('src_bcb_pix_participants','Banco Central Participantes Pix','https://www.bcb.gov.br/estabilidadefinanceira/participantespix','embedded_finance','dataset_http','partial','degraded',2,'monthly','bcb','official_list','cnpj','anonymous',false),
    ('src_transferegov_public_api','Transferegov.br API de Dados Abertos','https://www.gov.br/transferegov/pt-br/ferramentas-gestao/api-de-dados-abertos-transferegov.br','public_procurement_receivables','api','partial','degraded',2,'weekly','transferegov','official_api','cnpj','anonymous',false),
    ('src_wayback_company_history','Wayback Machine Company History','https://web.archive.org/cdx/search/cdx','company_site_history','api','real','healthy',2,'monthly','internet_archive','company_runtime_api','domain','anonymous',true),
    ('src_common_crawl_company_history','Common Crawl Company History','https://index.commoncrawl.org/collinfo.json','company_site_history','api','real','healthy',3,'monthly','common_crawl','company_runtime_api','domain','anonymous',true),
    ('src_datajud_public_api','CNJ DataJud API Pública','https://datajud-wiki.cnj.jus.br/api-publica/','judicial_risk','api','partial','degraded',3,'weekly','cnj','case_validation_api','process_number','public_api_key',false),
    ('src_comexstat_open_data','ComexStat Base de Dados Bruta','https://www.gov.br/mdic/pt-br/assuntos/comercio-exterior/estatisticas/base-de-dados-bruta','macro_sector_context','bulk_csv','partial','degraded',3,'monthly','mdic','bulk_snapshot','sector_geography','anonymous',false)
)
update public.source_catalog sc
set name=s.name,url=s.url,category=s.category,scope='BR',priority=s.priority,
    criticality=case when s.priority=1 then 'critical' when s.priority=2 then 'high' else 'medium' end,
    frequency=s.frequency,status=s.status,
    validation_rule='Preservar origem, competência, chave de match e evidência.',
    metadata=jsonb_build_object(
      'code',s.code,'provider',s.provider,'baseUrl',s.url,'captureMode',s.capture_mode,
      'entityKey',s.entity_key,'accessMode',s.access_mode,
      'implementedRuntime',s.implemented_runtime,'free',true
    ),
    source_type=s.source_type,
    auth_requirement=case when s.access_mode='free_registration' then 'free_registration'
                          when s.access_mode='public_api_key' then 'public_api_key'
                          else 'none' end,
    rate_limit_notes='Aplicar cache, backoff e ingestão idempotente.',
    health=s.health,updated_at=now()
from source_rows s
where sc.metadata->>'code'=s.code;

with source_rows(code,name,url,category,source_type,status,health,priority,frequency,provider,capture_mode,entity_key,access_mode,implemented_runtime) as (
  values
    ('src_rfb_cnpj_bulk','Receita Federal CNPJ Dados Abertos','https://arquivos.receitafederal.gov.br/cnpj/dados_abertos_cnpj/','cadastral','bulk_zip','partial','degraded',1,'monthly','receita_federal','bulk_snapshot','cnpj','anonymous',false),
    ('src_pgfn_divida_ativa_bulk','PGFN Dívida Ativa da União','https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao/transparencia-fiscal-1/dados-abertos','fiscal_risk','bulk_csv','partial','degraded',1,'quarterly','pgfn','bulk_snapshot','cnpj_root','anonymous',false),
    ('src_bndes_financing_operations','BNDES Operações de Financiamento','https://dadosabertos.bndes.gov.br/dataset/operacoes-financiamento','capital_structure','ckan_csv','partial','degraded',1,'monthly','bndes','ckan_resource','cnpj','anonymous',false),
    ('src_cgu_transparencia_bulk','CGU Portal da Transparência Downloads','https://portaldatransparencia.gov.br/download-de-dados/','compliance_public_sector','bulk_csv','partial','degraded',1,'monthly','cgu','bulk_snapshot','cnpj','anonymous',false),
    ('src_compras_gov_contracts','Compras.gov.br Contratos e Fornecedores','https://www.gov.br/compras/pt-br/cidadao/portal-de-dados-abertos/portal-de-dados-abertos','public_procurement_receivables','api_csv','partial','degraded',1,'weekly','compras_gov','api_with_csv_fallback','cnpj','anonymous',false),
    ('src_consumidor_gov_open_data','Consumidor.gov.br Dados Abertos','https://www.consumidor.gov.br/pages/dadosabertos/externo/','asset_quality','bulk_csv','partial','degraded',1,'monthly','consumidor_gov','bulk_snapshot','company_name','anonymous',false),
    ('src_inlabs_dou_xml','INLABS Diário Oficial da União XML','https://inlabs.in.gov.br/','regulatory','xml','partial','degraded',2,'daily','imprensa_nacional','registered_xml_download','cnpj_or_name','free_registration',false),
    ('src_inpi_ip_open_data','INPI Propriedade Industrial Dados Abertos','https://www.gov.br/inpi/pt-br/acesso-a-informacao/dados-abertos','product_innovation','bulk_zip','partial','degraded',2,'weekly','inpi','bulk_publication','cnpj_or_name','anonymous',false),
    ('src_bcb_ifdata','Banco Central IF.data','https://www3.bcb.gov.br/ifdata/','regulated_financials','dataset_api','partial','degraded',2,'quarterly','bcb','official_dataset','cnpj','anonymous',false),
    ('src_bcb_complaints_ranking','Banco Central Ranking de Reclamações','https://dadosabertos.bcb.gov.br/dataset/ranking-de-instituicoes-por-indice-de-reclamacoes','asset_quality','dataset_api','partial','degraded',2,'quarterly','bcb','official_dataset','regulated_entity','anonymous',false),
    ('src_github_public_api','GitHub Public API','https://api.github.com/search/repositories','digital_signal','api','real','healthy',2,'weekly','github','company_runtime_api','domain','anonymous_optional_token',true),
    ('src_bcb_pix_participants','Banco Central Participantes Pix','https://www.bcb.gov.br/estabilidadefinanceira/participantespix','embedded_finance','dataset_http','partial','degraded',2,'monthly','bcb','official_list','cnpj','anonymous',false),
    ('src_transferegov_public_api','Transferegov.br API de Dados Abertos','https://www.gov.br/transferegov/pt-br/ferramentas-gestao/api-de-dados-abertos-transferegov.br','public_procurement_receivables','api','partial','degraded',2,'weekly','transferegov','official_api','cnpj','anonymous',false),
    ('src_wayback_company_history','Wayback Machine Company History','https://web.archive.org/cdx/search/cdx','company_site_history','api','real','healthy',2,'monthly','internet_archive','company_runtime_api','domain','anonymous',true),
    ('src_common_crawl_company_history','Common Crawl Company History','https://index.commoncrawl.org/collinfo.json','company_site_history','api','real','healthy',3,'monthly','common_crawl','company_runtime_api','domain','anonymous',true),
    ('src_datajud_public_api','CNJ DataJud API Pública','https://datajud-wiki.cnj.jus.br/api-publica/','judicial_risk','api','partial','degraded',3,'weekly','cnj','case_validation_api','process_number','public_api_key',false),
    ('src_comexstat_open_data','ComexStat Base de Dados Bruta','https://www.gov.br/mdic/pt-br/assuntos/comercio-exterior/estatisticas/base-de-dados-bruta','macro_sector_context','bulk_csv','partial','degraded',3,'monthly','mdic','bulk_snapshot','sector_geography','anonymous',false)
)
insert into public.source_catalog(
  name,url,category,scope,priority,criticality,frequency,status,validation_rule,
  metadata,source_type,auth_requirement,rate_limit_notes,health
)
select s.name,s.url,s.category,'BR',s.priority,
  case when s.priority=1 then 'critical' when s.priority=2 then 'high' else 'medium' end,
  s.frequency,s.status,'Preservar origem, competência, chave de match e evidência.',
  jsonb_build_object(
    'code',s.code,'provider',s.provider,'baseUrl',s.url,'captureMode',s.capture_mode,
    'entityKey',s.entity_key,'accessMode',s.access_mode,
    'implementedRuntime',s.implemented_runtime,'free',true
  ),
  s.source_type,
  case when s.access_mode='free_registration' then 'free_registration'
       when s.access_mode='public_api_key' then 'public_api_key'
       else 'none' end,
  'Aplicar cache, backoff e ingestão idempotente.',s.health
from source_rows s
where not exists(select 1 from public.source_catalog sc where sc.metadata->>'code'=s.code);

insert into public.source_treatment_rules(
  source_code,signal_type,signal_family,strength_floor,confidence_delta,
  structural_score_delta,timing_score_delta,executability_score_delta,
  pattern_tags,treatment_policy
)
values
  ('src_rfb_cnpj_bulk','regulatory_event','corporate_structure',70,0.08,4,4,5,array['governance_signal','timing_trigger'],jsonb_build_object('output','company_signals','risk_disposition','positive')),
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
