-- Neon runtime bootstrap for Motor Originação.
-- Non-destructive seed of real operational configuration only.
-- Intentionally excludes synthetic/mock companies.

begin;

insert into public.source_catalog (
  id, name, category, scope, priority, criticality, frequency, status,
  validation_rule, source_type, auth_requirement, metadata, rate_limit_notes, health
)
values
  ((substr(md5('src_brasilapi_cnpj'),1,8)||'-'||substr(md5('src_brasilapi_cnpj'),9,4)||'-4'||substr(md5('src_brasilapi_cnpj'),14,3)||'-a'||substr(md5('src_brasilapi_cnpj'),18,3)||'-'||substr(md5('src_brasilapi_cnpj'),21,12))::uuid,
   'BrasilAPI CNPJ','Cadastral','company',1,'high','on_demand','real',
   'CNPJ válido e resposta HTTP 2xx','api','none',
   '{"code":"src_brasilapi_cnpj","baseUrl":"https://brasilapi.com.br/api/cnpj/v1"}'::jsonb,
   'Respeitar limites públicos do provedor.','healthy'),

  ((substr(md5('src_google_news_rss'),1,8)||'-'||substr(md5('src_google_news_rss'),9,4)||'-4'||substr(md5('src_google_news_rss'),14,3)||'-a'||substr(md5('src_google_news_rss'),18,3)||'-'||substr(md5('src_google_news_rss'),21,12))::uuid,
   'Google News RSS','News/RSS','company',2,'medium','daily','real',
   'Feed parseável e itens com URL/timestamp','rss','none',
   '{"code":"src_google_news_rss","provider":"rss"}'::jsonb,
   'Consulta leve, deduplicar por URL/hash.','healthy'),

  ((substr(md5('src_valor_rss'),1,8)||'-'||substr(md5('src_valor_rss'),9,4)||'-4'||substr(md5('src_valor_rss'),14,3)||'-a'||substr(md5('src_valor_rss'),18,3)||'-'||substr(md5('src_valor_rss'),21,12))::uuid,
   'Valor / Google News RSS','News/RSS','company',2,'medium','daily','real',
   'Feed parseável com foco em funding/capital/crédito','rss','none',
   '{"code":"src_valor_rss","provider":"google-news-rss","focus":"funding, capital e crédito"}'::jsonb,
   'Usar Google News RSS como camada pública de descoberta.','healthy'),

  ((substr(md5('src_company_website'),1,8)||'-'||substr(md5('src_company_website'),9,4)||'-4'||substr(md5('src_company_website'),14,3)||'-a'||substr(md5('src_company_website'),18,3)||'-'||substr(md5('src_company_website'),21,12))::uuid,
   'Company Website Monitor','Website monitoring','company',2,'medium','weekly','partial',
   'Homepage/careers acessíveis e hash comparável','sitemap','none',
   '{"code":"src_company_website","monitors":["homepage","careers"]}'::jsonb,
   'Evitar scraping agressivo; priorizar sitemap/RSS/API.','healthy'),

  ((substr(md5('src_cvm_rss'),1,8)||'-'||substr(md5('src_cvm_rss'),9,4)||'-4'||substr(md5('src_cvm_rss'),14,3)||'-a'||substr(md5('src_cvm_rss'),18,3)||'-'||substr(md5('src_cvm_rss'),21,12))::uuid,
   'CVM','Regulatório / Mercado de Capitais','market',1,'high','daily','real',
   'Origem oficial CVM, dataset/documento identificado','api','none',
   '{"code":"src_cvm_rss","focus":["FIDC","CRI","CRA","debentures","ofertas","fundos"]}'::jsonb,
   'Priorizar APIs/arquivos oficiais antes de scraping.','healthy')
on conflict (id) do update set
  name=excluded.name,
  category=excluded.category,
  scope=excluded.scope,
  priority=excluded.priority,
  criticality=excluded.criticality,
  frequency=excluded.frequency,
  status=excluded.status,
  validation_rule=excluded.validation_rule,
  source_type=excluded.source_type,
  auth_requirement=excluded.auth_requirement,
  metadata=excluded.metadata,
  rate_limit_notes=excluded.rate_limit_notes,
  health=excluded.health,
  updated_at=now();

insert into public.pattern_catalog (
  id, code, name, category, description, default_weight, active,
  pattern_name, pattern_family, explicit_features, latent_features,
  default_qualification_impact, default_lead_score_impact, default_ranking_impact
)
values
  ((substr(md5('growth_without_funding'),1,8)||'-'||substr(md5('growth_without_funding'),9,4)||'-4'||substr(md5('growth_without_funding'),14,3)||'-a'||substr(md5('growth_without_funding'),18,3)||'-'||substr(md5('growth_without_funding'),21,12))::uuid,
   'growth_without_funding','Growth without structured funding','funding_gap',
   'Crescimento acima da arquitetura atual de funding.',1,true,
   'Growth without structured funding','funding_gap',
   array['expansion_announcement','hiring_credit','warehouse_need'],
   array['balance_sheet_pressure','capital_dependency'],8,7,8),

  ((substr(md5('credit_without_capital_structure'),1,8)||'-'||substr(md5('credit_without_capital_structure'),9,4)||'-4'||substr(md5('credit_without_capital_structure'),14,3)||'-a'||substr(md5('credit_without_capital_structure'),18,3)||'-'||substr(md5('credit_without_capital_structure'),21,12))::uuid,
   'credit_without_capital_structure','Credit product without dedicated capital structure','product_capital_mismatch',
   'Produto de crédito sem estrutura dedicada de capital.',1,true,
   'Credit product without dedicated capital structure','product_capital_mismatch',
   array['credit_core','no_fidc'],array['capital_mismatch'],7,6,7),

  ((substr(md5('receivables_strong_funding_weak'),1,8)||'-'||substr(md5('receivables_strong_funding_weak'),9,4)||'-4'||substr(md5('receivables_strong_funding_weak'),14,3)||'-a'||substr(md5('receivables_strong_funding_weak'),18,3)||'-'||substr(md5('receivables_strong_funding_weak'),21,12))::uuid,
   'receivables_strong_funding_weak','Strong receivables base with weak funding architecture','receivables_fit',
   'Recebíveis fortes com funding stack fraco.',1,true,
   'Strong receivables base with weak funding architecture','receivables_fit',
   array['recurring_receivables'],array['fidc_fit'],9,6,8),

  ((substr(md5('expansion_outpacing_capital'),1,8)||'-'||substr(md5('expansion_outpacing_capital'),9,4)||'-4'||substr(md5('expansion_outpacing_capital'),14,3)||'-a'||substr(md5('expansion_outpacing_capital'),18,3)||'-'||substr(md5('expansion_outpacing_capital'),21,12))::uuid,
   'expansion_outpacing_capital','Expansion outpacing capital structure','timing',
   'Expansão supera a preparação da estrutura de capital.',1,true,
   'Expansion outpacing capital structure','timing',
   array['regional_expansion'],array['timing_window'],6,8,8),

  ((substr(md5('embedded_finance_pressure'),1,8)||'-'||substr(md5('embedded_finance_pressure'),9,4)||'-4'||substr(md5('embedded_finance_pressure'),14,3)||'-a'||substr(md5('embedded_finance_pressure'),18,3)||'-'||substr(md5('embedded_finance_pressure'),21,12))::uuid,
   'embedded_finance_pressure','Embedded finance with implicit balance-sheet pressure','embedded_finance',
   'Embedded finance pressiona balanço implicitamente.',1,true,
   'Embedded finance with implicit balance-sheet pressure','embedded_finance',
   array['embedded_finance'],array['implicit_balance_sheet_pressure'],6,7,7),

  ((substr(md5('sophisticated_credit_immature_funding'),1,8)||'-'||substr(md5('sophisticated_credit_immature_funding'),9,4)||'-4'||substr(md5('sophisticated_credit_immature_funding'),14,3)||'-a'||substr(md5('sophisticated_credit_immature_funding'),18,3)||'-'||substr(md5('sophisticated_credit_immature_funding'),21,12))::uuid,
   'sophisticated_credit_immature_funding','Sophisticated credit narrative, immature funding stack','governance_vs_capital',
   'Narrativa de crédito melhor que o funding stack.',1,true,
   'Sophisticated credit narrative, immature funding stack','governance_vs_capital',
   array['underwriting_story','risk_hiring'],array['immature_funding_stack'],6,5,6),

  ((substr(md5('operational_maturity_readiness_gap'),1,8)||'-'||substr(md5('operational_maturity_readiness_gap'),9,4)||'-4'||substr(md5('operational_maturity_readiness_gap'),14,3)||'-a'||substr(md5('operational_maturity_readiness_gap'),18,3)||'-'||substr(md5('operational_maturity_readiness_gap'),21,12))::uuid,
   'operational_maturity_readiness_gap','Operational maturity without capital-market readiness','readiness_gap',
   'Maturidade operacional sem prontidão plena de mercado de capitais.',1,true,
   'Operational maturity without capital-market readiness','readiness_gap',
   array['ops_maturity'],array['needs_preparation_track'],4,4,5),

  ((substr(md5('hidden_funding_dependency'),1,8)||'-'||substr(md5('hidden_funding_dependency'),9,4)||'-4'||substr(md5('hidden_funding_dependency'),14,3)||'-a'||substr(md5('hidden_funding_dependency'),18,3)||'-'||substr(md5('hidden_funding_dependency'),21,12))::uuid,
   'hidden_funding_dependency','Funding dependence hidden in commercial narrative','hidden_dependency',
   'Dependência de funding escondida na narrativa comercial.',1,true,
   'Funding dependence hidden in commercial narrative','hidden_dependency',
   array['commercial_growth'],array['hidden_funding_dependency'],5,6,6),

  ((substr(md5('capital_mismatch_business_model'),1,8)||'-'||substr(md5('capital_mismatch_business_model'),9,4)||'-4'||substr(md5('capital_mismatch_business_model'),14,3)||'-a'||substr(md5('capital_mismatch_business_model'),18,3)||'-'||substr(md5('capital_mismatch_business_model'),21,12))::uuid,
   'capital_mismatch_business_model','Capital mismatch for business model','capital_mismatch',
   'Estrutura de capital inadequada ao modelo de negócio.',1,true,
   'Capital mismatch for business model','capital_mismatch',
   array['duration_mismatch','balance_sheet_only'],array['capital_architecture_gap'],8,8,9),

  ((substr(md5('momentum_timing_structural_gap'),1,8)||'-'||substr(md5('momentum_timing_structural_gap'),9,4)||'-4'||substr(md5('momentum_timing_structural_gap'),14,3)||'-a'||substr(md5('momentum_timing_structural_gap'),18,3)||'-'||substr(md5('momentum_timing_structural_gap'),21,12))::uuid,
   'momentum_timing_structural_gap','Momentum + timing + structural gap','momentum',
   'Momento, timing e gap estrutural criam janela comercial.',1,true,
   'Momentum + timing + structural gap','momentum',
   array['momentum','recent_trigger','funding_gap'],array['high_priority_window'],7,9,9)
on conflict (code) do update set
  name=excluded.name,
  category=excluded.category,
  description=excluded.description,
  default_weight=excluded.default_weight,
  active=excluded.active,
  pattern_name=excluded.pattern_name,
  pattern_family=excluded.pattern_family,
  explicit_features=excluded.explicit_features,
  latent_features=excluded.latent_features,
  default_qualification_impact=excluded.default_qualification_impact,
  default_lead_score_impact=excluded.default_lead_score_impact,
  default_ranking_impact=excluded.default_ranking_impact,
  updated_at=now();

insert into public.search_profiles (
  id, name, description, target_segments, target_keywords,
  min_employee_count, geography, active, config
)
values
  ('sp_fintech_credit_receivables',
   'Fintechs com crédito e recebíveis estruturáveis',
   'Empresas brasileiras com produto de crédito, recebíveis recorrentes e potencial de FIDC/DCM.',
   array['Fintech','Embedded Finance','Payments'],
   array['crédito','recebíveis','antecipação','consignado','capital de giro','FIDC'],
   50,'Brasil',true,
   '{"products":["FIDC","Warehouse","Nota Comercial","Debênture"],"prioritize":["credit_is_core","receivables_structurable","funding_gap","vc_pe_backed"],"timingSignals":["growth","hiring_credit_risk_capital_markets","new_credit_product"]}'::jsonb),

  ('sp_middle_market_tech_dcm',
   'Middle market tech com necessidade de DCM',
   'Empresas tech-based/tech-backed com escala, crescimento e necessidade potencial de dívida estruturada.',
   array['SaaS','Technology','Marketplace','Healthtech','Edtech','Logistics Tech'],
   array['expansão','aquisição','capex','capital de giro','dívida','debênture','nota comercial'],
   50,'Brasil',true,
   '{"products":["Nota Comercial","Debênture","Bridge","KGiro"],"prioritize":["middle_market","growth_without_funding","capital_mismatch","vc_pe_backed"],"ticketPreference":{"minimum":15000000,"ideal":50000000}}'::jsonb),

  ('sp_embedded_finance_pressure',
   'Embedded finance sob pressão de funding',
   'Empresas com crédito embutido cuja expansão pode pressionar balanço e exigir funding dedicado.',
   array['Embedded Finance','Payments','ERP','SaaS'],
   array['embedded lending','crédito embutido','BNPL','antecipação','working capital'],
   50,'Brasil',true,
   '{"products":["Warehouse","FIDC","Nota Comercial"],"prioritize":["embedded_finance_pressure","credit_is_core","balance_sheet_pressure"]}'::jsonb),

  ('sp_infra_tech_capital',
   'Infra tech / data center com demanda de capital',
   'Empresas de infraestrutura tecnológica com expansão/capex compatível com estruturas DCM.',
   array['Data Center','Infra Tech','Cloud Infrastructure'],
   array['capex','expansão','data center','infraestrutura','financiamento','debênture'],
   50,'Brasil',true,
   '{"products":["Debênture","Nota Comercial","Bridge"],"prioritize":["capex_cycle","expansion_outpacing_capital","sponsor_backed"]}'::jsonb)
on conflict (id) do update set
  name=excluded.name,
  description=excluded.description,
  target_segments=excluded.target_segments,
  target_keywords=excluded.target_keywords,
  min_employee_count=excluded.min_employee_count,
  geography=excluded.geography,
  active=excluded.active,
  config=excluded.config,
  updated_at=now();

insert into public.search_profile_filters (id, profile_id, filter_key, filter_value)
values
  ((substr(md5('sp_fintech_credit_receivables:employee_count'),1,8)||'-'||substr(md5('sp_fintech_credit_receivables:employee_count'),9,4)||'-4'||substr(md5('sp_fintech_credit_receivables:employee_count'),14,3)||'-a'||substr(md5('sp_fintech_credit_receivables:employee_count'),18,3)||'-'||substr(md5('sp_fintech_credit_receivables:employee_count'),21,12))::uuid,'sp_fintech_credit_receivables','min_employee_count','50'::jsonb),
  ((substr(md5('sp_fintech_credit_receivables:geography'),1,8)||'-'||substr(md5('sp_fintech_credit_receivables:geography'),9,4)||'-4'||substr(md5('sp_fintech_credit_receivables:geography'),14,3)||'-a'||substr(md5('sp_fintech_credit_receivables:geography'),18,3)||'-'||substr(md5('sp_fintech_credit_receivables:geography'),21,12))::uuid,'sp_fintech_credit_receivables','geography','"Brasil"'::jsonb),
  ((substr(md5('sp_middle_market_tech_dcm:employee_count'),1,8)||'-'||substr(md5('sp_middle_market_tech_dcm:employee_count'),9,4)||'-4'||substr(md5('sp_middle_market_tech_dcm:employee_count'),14,3)||'-a'||substr(md5('sp_middle_market_tech_dcm:employee_count'),18,3)||'-'||substr(md5('sp_middle_market_tech_dcm:employee_count'),21,12))::uuid,'sp_middle_market_tech_dcm','min_employee_count','50'::jsonb),
  ((substr(md5('sp_embedded_finance_pressure:employee_count'),1,8)||'-'||substr(md5('sp_embedded_finance_pressure:employee_count'),9,4)||'-4'||substr(md5('sp_embedded_finance_pressure:employee_count'),14,3)||'-a'||substr(md5('sp_embedded_finance_pressure:employee_count'),18,3)||'-'||substr(md5('sp_embedded_finance_pressure:employee_count'),21,12))::uuid,'sp_embedded_finance_pressure','min_employee_count','50'::jsonb),
  ((substr(md5('sp_infra_tech_capital:employee_count'),1,8)||'-'||substr(md5('sp_infra_tech_capital:employee_count'),9,4)||'-4'||substr(md5('sp_infra_tech_capital:employee_count'),14,3)||'-a'||substr(md5('sp_infra_tech_capital:employee_count'),18,3)||'-'||substr(md5('sp_infra_tech_capital:employee_count'),21,12))::uuid,'sp_infra_tech_capital','min_employee_count','50'::jsonb);

commit;
