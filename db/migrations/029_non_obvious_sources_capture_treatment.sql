-- Non-obvious data source activation for Origination Intelligence Platform.
-- Goal: expand beyond obvious news/RSS while keeping Brasil-only, public/monitorable, lineage-ready capture.
-- Runtime path: source_catalog real rss/queryTemplate -> data capture engine -> monitoring_outputs -> company_signals.

create table if not exists public.source_treatment_rules (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  signal_type text not null,
  signal_family text not null,
  strength_floor integer not null default 60,
  confidence_delta numeric(5,2) not null default 0,
  structural_score_delta integer not null default 0,
  timing_score_delta integer not null default 0,
  executability_score_delta integer not null default 0,
  pattern_tags text[] not null default array[]::text[],
  treatment_policy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_code, signal_type)
);

insert into public.source_catalog (id, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
values
  (
    'src_pncp_public_contracts_rss',
    'PNCP / Contratos Publicos Signals',
    'rss',
    'public_procurement_receivables',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_pncp_public_contracts_rss',
      'provider', 'Google News RSS + PNCP dork',
      'officialUrl', 'https://pncp.gov.br/api/consulta/swagger-ui/index.html',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} PNCP licitacao contrato publico empenho fornecedor recebiveis',
      'signalIntent', 'Detectar contratos publicos, empenhos e receitas contratadas que podem virar recebivel estruturavel.',
      'treatment', jsonb_build_object('signalType','public_contract_receivables','patterns',array['public_contract_receivables','receivables_strong'],'nextStep','validar contrato, prazo de pagamento, devedor publico e cessibilidade')
    ),
    'Public RSS dork. API PNCP oficial fica mapeada para conector dedicado posterior.',
    'healthy'
  ),
  (
    'src_dou_corporate_events_rss',
    'Diario Oficial / Regulatory Events Signals',
    'rss',
    'regulatory_event',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_dou_corporate_events_rss',
      'provider', 'Google News RSS + DOU dork',
      'officialUrl', 'https://www.in.gov.br/consulta',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} diario oficial autorizacao credenciamento homologacao contrato portaria',
      'signalIntent', 'Capturar mudancas regulatórias, credenciamentos, autorizacoes e contratos que alterem timing de abordagem.',
      'treatment', jsonb_build_object('signalType','regulatory_event','patterns',array['timing_trigger','governance_signal'],'nextStep','confirmar ato, entidade emissora, impacto financeiro e urgencia')
    ),
    'Public RSS dork; sem scraping direto do DOU nesta fase.',
    'healthy'
  ),
  (
    'src_gov_sanctions_rss',
    'CEIS / CNEP Sanctions Signals',
    'rss',
    'legal_compliance_risk',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_gov_sanctions_rss',
      'provider', 'Google News RSS + transparencia dork',
      'officialUrl', 'https://portaldatransparencia.gov.br/sancoes',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} CEIS CNEP sancao inidonea suspensa Portal da Transparencia',
      'signalIntent', 'Detectar red flags de compliance que reduzem executabilidade de DCM/FIDC.',
      'treatment', jsonb_build_object('signalType','legal_compliance_risk','patterns',array['risk_signal'],'nextStep','checar severidade, data, esfera e status da sancao')
    ),
    'Public RSS dork. API de dados exige chave do Portal da Transparencia para etapa posterior.',
    'healthy'
  ),
  (
    'src_pgfn_fiscal_stress_rss',
    'PGFN Divida Ativa / Fiscal Stress Signals',
    'rss',
    'fiscal_risk',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_pgfn_fiscal_stress_rss',
      'provider', 'Google News RSS + PGFN dork',
      'officialUrl', 'https://www.gov.br/pgfn/pt-br/assuntos/divida-ativa-da-uniao',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} PGFN divida ativa regularidade fiscal certidao negativa',
      'signalIntent', 'Antecipar restricoes fiscais, stress de caixa e friccao para estruturacao.',
      'treatment', jsonb_build_object('signalType','fiscal_stress','patterns',array['risk_signal','capital_mismatch'],'nextStep','validar certidao, valor, natureza da divida e materialidade')
    ),
    'Public RSS dork; dataset oficial deve virar batch connector em fase posterior.',
    'healthy'
  ),
  (
    'src_cenprot_protest_rss',
    'CENPROT / Protestos Signals',
    'rss',
    'legal_liquidity_risk',
    'none_or_paid',
    'real',
    jsonb_build_object(
      'code', 'src_cenprot_protest_rss',
      'provider', 'Google News RSS + protesto dork',
      'officialUrl', 'https://site.cenprotnacional.org.br/',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} protesto cartorio CENPROT divida atraso cobranca',
      'signalIntent', 'Detectar protestos e sinais de liquidez fraca antes de contato comercial.',
      'treatment', jsonb_build_object('signalType','liquidity_stress','patterns',array['risk_signal'],'nextStep','validar consulta oficial, montante e recorrencia')
    ),
    'RSS dork agora; API/consulta oficial somente respeitando ToS/autorizacao.',
    'healthy'
  ),
  (
    'src_judicial_recovery_rss',
    'Judicial Recovery / Falencia Signals',
    'rss',
    'judicial_risk',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_judicial_recovery_rss',
      'provider', 'Google News RSS + judiciary dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} recuperacao judicial falencia execucao fiscal processo credores',
      'signalIntent', 'Identificar risco jurídico severo e eventos de stress que alteram abordagem/comercial.',
      'treatment', jsonb_build_object('signalType','judicial_stress','patterns',array['risk_signal'],'nextStep','validar processo, polo, valor, status e relacao com a empresa alvo')
    ),
    'Public dork. Nao faz scraping de tribunais nesta fase.',
    'healthy'
  ),
  (
    'src_reclame_aqui_demand_quality_rss',
    'Reclame Aqui / Demand Quality Signals',
    'rss',
    'demand_quality_risk',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_reclame_aqui_demand_quality_rss',
      'provider', 'Google News RSS + Reclame Aqui dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} Reclame Aqui chargeback cancelamento cobranca atraso contestacao',
      'signalIntent', 'Ler qualidade de demanda, cobrança, cancelamentos e chargeback em empresas com recebiveis.',
      'treatment', jsonb_build_object('signalType','demand_quality_risk','patterns',array['risk_signal','receivables_quality'],'nextStep','checar volume, natureza das reclamacoes e impacto em recebiveis')
    ),
    'RSS dork. Sem scraping do Reclame Aqui.',
    'healthy'
  ),
  (
    'src_terms_credit_product_rss',
    'Terms / Credit Product Surface Signals',
    'rss',
    'company_site_deep_terms',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_terms_credit_product_rss',
      'provider', 'Google News RSS + site terms dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', 'site:{websiteDomain} {company} termos de uso credito limite financiamento parcelamento antecipacao recebiveis',
      'fallbackQueryTemplate', '{company} termos de uso credito limite financiamento parcelamento antecipacao recebiveis',
      'signalIntent', 'Encontrar produto de credito escondido em termos, FAQ, politicas e paginas pouco navegadas.',
      'treatment', jsonb_build_object('signalType','product_credit_terms','patterns',array['embedded_finance_pressure','credit_is_core'],'nextStep','validar produto, tomador, ativo gerado e necessidade de funding')
    ),
    'O runtime atual usa fallback query template; suporte a websiteDomain será adicionado em etapa seguinte.',
    'healthy'
  ),
  (
    'src_jobs_credit_hiring_rss',
    'Jobs / Credit Team Hiring Signals',
    'rss',
    'jobs_org_design',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_jobs_credit_hiring_rss',
      'provider', 'Google News RSS + jobs dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} vagas credito risco underwriting cobranca funding collections analista de credito',
      'signalIntent', 'Detectar montagem de time de crédito, cobrança, risco ou funding como sinal fraco de produto financeiro.',
      'treatment', jsonb_build_object('signalType','credit_team_hiring','patterns',array['growth_without_funding','embedded_finance_pressure'],'nextStep','mapear área, senioridade, volume de vagas e provável dono da pauta')
    ),
    'Public RSS dork; sites de vaga podem variar por indexacao.',
    'healthy'
  ),
  (
    'src_vc_portfolio_change_rss',
    'VC Portfolio Change Signals',
    'rss',
    'vc_portfolio',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_vc_portfolio_change_rss',
      'provider', 'Google News RSS + VC portfolio dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} portfolio investida venture capital rodada growth capital seed series A series B',
      'signalIntent', 'Detectar mudanças de portfólio, rodadas e investidores para priorização de middle market tech-backed.',
      'treatment', jsonb_build_object('signalType','vc_portfolio_signal','patterns',array['growth_without_funding','expansion_outpacing_capital'],'nextStep','identificar investidor, estágio, data e follow-on provável')
    ),
    'Public RSS dork; páginas de portfólio dedicadas podem virar crawler governado.',
    'healthy'
  ),
  (
    'src_open_finance_participants_rss',
    'Open Finance / Payments Participant Signals',
    'rss',
    'financial_infrastructure',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_open_finance_participants_rss',
      'provider', 'Google News RSS + Open Finance dork',
      'officialUrl', 'https://openfinancebrasil.org.br/',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} Open Finance participante instituicao pagamento iniciador credito banco central',
      'signalIntent', 'Identificar empresas entrando em infraestrutura financeira regulada ou embedded finance.',
      'treatment', jsonb_build_object('signalType','financial_infrastructure_signal','patterns',array['embedded_finance_pressure','credit_is_core'],'nextStep','validar autorizacao, papel no ecossistema e ativo financeiro gerado')
    ),
    'Public RSS dork; diretórios oficiais podem virar connector dedicado.',
    'healthy'
  ),
  (
    'src_github_product_signal_rss',
    'GitHub / Developer Surface Signals',
    'rss',
    'technical_product_signal',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_github_product_signal_rss',
      'provider', 'Google News RSS + GitHub dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} GitHub API SDK checkout pix boleto credito marketplace recebiveis',
      'signalIntent', 'Encontrar sinais técnicos de produto financeiro, APIs, checkout, cobrança e integração.',
      'treatment', jsonb_build_object('signalType','technical_product_signal','patterns',array['embedded_finance_pressure','product_launch'],'nextStep','validar repos, docs publicas e produto financeiro exposto')
    ),
    'Public RSS dork; GitHub API connector pode ser adicionado sem stack paralela.',
    'healthy'
  ),
  (
    'src_youtube_webinar_signal_rss',
    'YouTube / Webinar Market Education Signals',
    'rss',
    'social_signal',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_youtube_webinar_signal_rss',
      'provider', 'Google News RSS + YouTube dork',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} YouTube webinar credito recebiveis funding fintech cobranca antecipacao',
      'signalIntent', 'Detectar narrativa comercial e educação de mercado antes de anúncio formal.',
      'treatment', jsonb_build_object('signalType','market_education_signal','patterns',array['timing_trigger','product_launch'],'nextStep','assistir/registrar tese comunicada e decisores envolvidos')
    ),
    'Public RSS dork. Sem coleta de comentários ou dados pessoais.',
    'healthy'
  ),
  (
    'src_bndes_financing_rss',
    'BNDES / Public Financing Signals',
    'rss',
    'public_financing',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_bndes_financing_rss',
      'provider', 'Google News RSS + BNDES dork',
      'officialUrl', 'https://www.bndes.gov.br/wps/portal/site/home/transparencia/consulta-operacoes-bndes',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} BNDES financiamento operacao inovacao capital de giro credito',
      'signalIntent', 'Detectar dependência de financiamento público ou histórico de operação que afete estrutura de capital.',
      'treatment', jsonb_build_object('signalType','public_financing_signal','patterns',array['capital_structure','funding_gap'],'nextStep','validar produto BNDES, valor, prazo, garantias e complementaridade DCM')
    ),
    'Public RSS dork; consulta oficial pode virar batch connector.',
    'healthy'
  ),
  (
    'src_comexstat_exporter_rss',
    'ComexStat / Export Receivables Signals',
    'rss',
    'export_receivables',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_comexstat_exporter_rss',
      'provider', 'Google News RSS + ComexStat dork',
      'officialUrl', 'https://comexstat.mdic.gov.br/',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} exportacao importacao ComexStat cambio contrato internacional recebiveis',
      'signalIntent', 'Mapear potenciais recebíveis internacionais, risco cambial e funding de capital de giro exportador.',
      'treatment', jsonb_build_object('signalType','international_receivables_signal','patterns',array['receivables_strong','capital_mismatch'],'nextStep','validar exposição cambial, prazo de recebimento e carteira de compradores')
    ),
    'Public RSS dork; API ComexStat pode ser mapeada como connector dedicado.',
    'healthy'
  ),
  (
    'src_inpi_ip_signal_rss',
    'INPI / IP Product Expansion Signals',
    'rss',
    'ip_product_signal',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_inpi_ip_signal_rss',
      'provider', 'Google News RSS + INPI dork',
      'officialUrl', 'https://www.gov.br/inpi/pt-br',
      'captureMode', 'google_news_rss_dork',
      'queryTemplate', '{company} INPI marca patente software produto registro',
      'signalIntent', 'Capturar expansão de produto, marca e propriedade intelectual como sinal de maturidade/escala.',
      'treatment', jsonb_build_object('signalType','product_expansion_signal','patterns',array['expansion','timing_trigger'],'nextStep','validar classe, titularidade, data e relação com produto financeiro')
    ),
    'Public RSS dork; sem scraping do INPI.',
    'healthy'
  )
on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  category = excluded.category,
  auth_requirement = excluded.auth_requirement,
  status = excluded.status,
  metadata = public.source_catalog.metadata || excluded.metadata,
  rate_limit_notes = excluded.rate_limit_notes,
  health = excluded.health,
  updated_at = now();

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
  ('src_pncp_public_contracts_rss','public_contract_receivables','receivables',82,0.05,8,5,6,array['receivables_strong','funding_gap'],'{"output":"company_signals","qualification_use":"has_receivables=true when evidence confirms contract/receivable","next_action":"validate public debtor, payment term and assignment feasibility"}'::jsonb),
  ('src_dou_corporate_events_rss','regulatory_event','timing',78,0.04,3,8,4,array['timing_trigger','governance_signal'],'{"output":"trigger_events","qualification_use":"timing_intensity up if event is recent and material"}'::jsonb),
  ('src_gov_sanctions_rss','legal_compliance_risk','risk',84,-0.08,0,5,-10,array['risk_signal'],'{"output":"company_signals","qualification_use":"execution_readiness down until compliance review"}'::jsonb),
  ('src_pgfn_fiscal_stress_rss','fiscal_stress','risk',82,-0.06,0,4,-8,array['capital_mismatch','risk_signal'],'{"output":"company_signals","qualification_use":"capital_structure_quality down if material and current"}'::jsonb),
  ('src_cenprot_protest_rss','liquidity_stress','risk',84,-0.08,0,5,-8,array['liquidity_stress','risk_signal'],'{"output":"company_signals","qualification_use":"funding_gap up, executability down until confirmed"}'::jsonb),
  ('src_judicial_recovery_rss','judicial_stress','risk',95,-0.15,0,10,-20,array['distress','risk_signal'],'{"output":"company_signals","qualification_use":"hard red flag unless opportunity is distressed credit"}'::jsonb),
  ('src_reclame_aqui_demand_quality_rss','demand_quality_risk','asset_quality',72,-0.03,0,3,-4,array['receivables_quality','risk_signal'],'{"output":"company_signals","qualification_use":"requires receivables quality review"}'::jsonb),
  ('src_terms_credit_product_rss','product_credit_terms','structural_need',83,0.08,12,5,5,array['credit_is_core','embedded_finance_pressure'],'{"output":"company_signals","qualification_use":"has_credit_product=true if product page confirms credit/financing"}'::jsonb),
  ('src_jobs_credit_hiring_rss','credit_team_hiring','latent_growth',77,0.04,5,7,3,array['growth_without_funding','embedded_finance_pressure'],'{"output":"company_signals","qualification_use":"latent signal of credit buildout or collection pressure"}'::jsonb),
  ('src_vc_portfolio_change_rss','vc_portfolio_signal','growth',76,0.05,3,8,4,array['growth_without_funding','expansion_outpacing_capital'],'{"output":"company_signals","qualification_use":"timing up when investor/funding event is recent"}'::jsonb),
  ('src_open_finance_participants_rss','financial_infrastructure_signal','embedded_finance',80,0.06,8,5,6,array['embedded_finance_pressure','credit_is_core'],'{"output":"company_signals","qualification_use":"structural need up if financial infra role confirmed"}'::jsonb),
  ('src_github_product_signal_rss','technical_product_signal','product',70,0.03,4,4,2,array['product_launch','embedded_finance_pressure'],'{"output":"company_signals","qualification_use":"corroborates product/technical maturity"}'::jsonb),
  ('src_youtube_webinar_signal_rss','market_education_signal','timing',68,0.02,2,5,1,array['timing_trigger','product_launch'],'{"output":"company_signals","qualification_use":"weak-to-medium timing signal; needs corroboration"}'::jsonb),
  ('src_bndes_financing_rss','public_financing_signal','capital_structure',76,0.03,5,4,4,array['capital_structure','funding_gap'],'{"output":"company_signals","qualification_use":"map existing funding and refinancing angle"}'::jsonb),
  ('src_comexstat_exporter_rss','international_receivables_signal','receivables',70,0.03,6,3,4,array['receivables_strong','capital_mismatch'],'{"output":"company_signals","qualification_use":"explore export receivables and FX working capital"}'::jsonb),
  ('src_inpi_ip_signal_rss','product_expansion_signal','expansion',66,0.02,2,4,1,array['expansion','timing_trigger'],'{"output":"company_signals","qualification_use":"weak expansion/maturity signal; needs corroboration"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
