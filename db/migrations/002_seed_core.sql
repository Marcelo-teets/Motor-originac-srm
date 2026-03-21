-- Seed data aligned with canonical architecture and agent v1 flows.
insert into source_catalog (id, name, source_type, category, status, metadata, health)
values
  ('src_brasilapi_cnpj', 'BrasilAPI CNPJ', 'api', 'Cadastral', 'real', '{"baseUrl":"https://brasilapi.com.br/api/cnpj/v1"}', 'healthy'),
  ('src_google_news_rss', 'Google News RSS', 'rss', 'News/RSS', 'real', '{"provider":"rss"}', 'healthy'),
  ('src_company_website', 'Company Website Monitor', 'sitemap', 'Website monitoring', 'partial', '{"monitors":["homepage","careers"]}', 'healthy'),
  ('src_cvm_rss', 'CVM RSS', 'rss', 'Regulatório', 'partial', '{"focus":"fundos"}', 'healthy')
on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  category = excluded.category,
  status = excluded.status,
  metadata = excluded.metadata,
  health = excluded.health;

insert into pattern_catalog (id, pattern_name, pattern_family, description, explicit_features, latent_features, default_qualification_impact, default_lead_score_impact, default_ranking_impact)
values
  ('pat_1', 'Growth without structured funding', 'funding_gap', 'Crescimento acima da arquitetura atual de funding.', '["expansion_announcement","hiring_credit","warehouse_need"]', '["balance_sheet_pressure","capital_dependency"]', 8, 7, 8),
  ('pat_2', 'Credit product without dedicated capital structure', 'product_capital_mismatch', 'Produto de crédito sem estrutura dedicada de capital.', '["credit_core","no_fidc"]', '["capital_mismatch"]', 7, 6, 7),
  ('pat_3', 'Strong receivables base with weak funding architecture', 'receivables_fit', 'Recebíveis fortes com funding stack fraco.', '["recurring_receivables"]', '["fidc_fit"]', 9, 6, 8),
  ('pat_4', 'Expansion outpacing capital structure', 'timing', 'Expansão supera a preparação da estrutura de capital.', '["regional_expansion"]', '["timing_window"]', 6, 8, 8),
  ('pat_5', 'Embedded finance with implicit balance-sheet pressure', 'embedded_finance', 'Embedded finance pressiona balanço implicitamente.', '["embedded_finance"]', '["implicit_balance_sheet_pressure"]', 6, 7, 7),
  ('pat_6', 'Sophisticated credit narrative, immature funding stack', 'governance_vs_capital', 'Narrativa de crédito melhor que o funding stack.', '["underwriting_story","risk_hiring"]', '["immature_funding_stack"]', 6, 5, 6),
  ('pat_7', 'Operational maturity signals without capital market readiness yet', 'readiness_gap', 'Maturidade operacional sem prontidão plena de mercado de capitais.', '["ops_maturity"]', '["needs_preparation_track"]', 4, 4, 5),
  ('pat_8', 'Funding dependence hidden in commercial narrative', 'hidden_dependency', 'Dependência de funding escondida na narrativa comercial.', '["commercial_growth"]', '["hidden_funding_dependency"]', 5, 6, 6),
  ('pat_9', 'Capital mismatch for business model', 'capital_mismatch', 'Estrutura de capital inadequada ao modelo de negócio.', '["duration_mismatch","balance_sheet_only"]', '["capital_architecture_gap"]', 8, 8, 9),
  ('pat_10', 'Momentum + timing + structural gap', 'momentum', 'Momento, timing e gap estrutural criam janela comercial.', '["momentum","recent_trigger","funding_gap"]', '["high_priority_window"]', 7, 9, 9)
on conflict (id) do update set
  pattern_name = excluded.pattern_name,
  pattern_family = excluded.pattern_family,
  description = excluded.description,
  explicit_features = excluded.explicit_features,
  latent_features = excluded.latent_features,
  default_qualification_impact = excluded.default_qualification_impact,
  default_lead_score_impact = excluded.default_lead_score_impact,
  default_ranking_impact = excluded.default_ranking_impact;

insert into search_profiles (id, name, segment, subsegment, company_type, geography, credit_product, target_structure, minimum_signal_intensity, minimum_confidence, time_window_days, status, profile_payload)
values
  ('sp_growth_fidc', 'Growth lenders com gap de capital', 'Fintech', 'Embedded lending e recebíveis', 'Scale-up', 'Brasil', 'Antecipação de recebíveis', 'FIDC', 65, 0.72, 120, 'active', '{"requiresStructuredFundingGap":true}'),
  ('sp_embedded_note', 'Embedded finance para bridge DCM/NC', 'Embedded Finance', 'Payments + crédito SMB', 'Growth', 'Brasil', 'Capital de giro', 'Nota comercial', 60, 0.68, 90, 'active', '{"thesisMode":"bridge-to-dcm"}')
on conflict (id) do update set
  name = excluded.name,
  segment = excluded.segment,
  subsegment = excluded.subsegment,
  company_type = excluded.company_type,
  geography = excluded.geography,
  credit_product = excluded.credit_product,
  target_structure = excluded.target_structure,
  minimum_signal_intensity = excluded.minimum_signal_intensity,
  minimum_confidence = excluded.minimum_confidence,
  time_window_days = excluded.time_window_days,
  status = excluded.status,
  profile_payload = excluded.profile_payload;

insert into companies (id, legal_name, trade_name, cnpj, segment, subsegment, geography, company_type, stage, website, current_funding_structure, observed_payload, inferred_payload, estimated_payload, source_trace)
values
  ('cmp_neon_receivables', 'Neon Receivables Tecnologia Financeira S.A.', 'Neon Receivables', '27865757000102', 'Fintech', 'Crédito consignado B2B2C', 'Brasil', 'Scale-up', 'Series B+', 'https://www.neonreceivables.com.br', 'Balanço próprio + linhas bilaterais', '{"description":"Originadora de crédito com expansão em canais distribuídos e base recorrente de recebíveis.","credit_product":"Antecipação de recebíveis","receivables":["Cartão","Folha"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.82}}'::jsonb, '{"marketMapPeers":[{"peerName":"Receivables Alpha","peerType":"FIDC-backed lender","rationale":"Benchmark de funding lastreado em recebíveis elegíveis."}]}'::jsonb, '[]'::jsonb),
  ('cmp_orbit_pay', 'Orbit Pay Soluções Financeiras Ltda.', 'Orbit Pay', '16408321000177', 'Embedded Finance', 'Payments + crédito para SMB', 'Brasil', 'Growth', 'Series A', 'https://www.orbitpay.com.br', 'Balanço próprio', '{"description":"Plataforma de pagamentos que embute capital de giro para SMBs.","credit_product":"Capital de giro","receivables":["Assinaturas","Cartão"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.75}}'::jsonb, '{"marketMapPeers":[{"peerName":"SaaS Capital Delta","peerType":"NC / private notes","rationale":"Bridge para DCM privado."}]}'::jsonb, '[]'::jsonb),
  ('cmp_axon_health', 'Axon Health Crédito Ltda.', 'Axon Health Credit', '41190843000195', 'Healthtech', 'Parcelamento médico', 'Brasil', 'Growth', 'Series A', 'https://www.axonhealthcredit.com.br', 'Debênture privada piloto', '{"description":"Healthtech com parcelamento médico e underwriting setorial.","credit_product":"BNPL","receivables":["Mensalidades","Duplicatas"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.71}}'::jsonb, '{"marketMapPeers":[{"peerName":"Clinic Finance Theta","peerType":"Warehouse route","rationale":"Comparável em prazo de recebíveis do setor saúde."}]}'::jsonb, '[]'::jsonb),
  ('cmp_arbo_pay', 'Arbo Pay Soluções Financeiras Ltda.', 'Arbo Pay', '13765432000110', 'Embedded Finance', 'Crédito para lojistas', 'Brasil', 'Growth', 'Series A', 'https://www.arbopay.com.br', 'Balanço próprio + nota comercial curta', '{"description":"Plataforma de pagamentos com oferta de capital de giro para base SME.","credit_product":"Capital de giro embutido","receivables":["Cartão","Boletos"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.76}}'::jsonb, '{"marketMapPeers":[{"peerName":"Orbit Pay","peerType":"Embedded lender","rationale":"Comparável por distribuição via pagamentos."}]}'::jsonb, '[]'::jsonb),
  ('cmp_cedro_saude', 'Cedro Saúde Crédito Ltda.', 'Cedro Saúde', '20987654000144', 'Healthtech', 'Parcelamento e recorrência médica', 'Brasil', 'Growth', 'Series A', 'https://www.cedrosaude.com.br', 'Linhas bilaterais + caixa', '{"description":"Healthtech com carteira recorrente de parcelamento clínico.","credit_product":"Parcelamento médico","receivables":["Mensalidades","Cartão"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.72}}'::jsonb, '{"marketMapPeers":[{"peerName":"Axon Health Credit","peerType":"Health BNPL","rationale":"Benchmark setorial."}]}'::jsonb, '[]'::jsonb),
  ('cmp_nexo_log', 'Nexo Log Finance S.A.', 'Nexo Log', '30876543000155', 'Logistics', 'Frete e capital de giro', 'Brasil', 'Scale-up', 'Series B', 'https://www.nexolog.com.br', 'Warehouse tático', '{"description":"Funding para cadeia de frete e recebíveis B2B.","credit_product":"Antecipação a transportadoras","receivables":["Duplicatas","Frete"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.79}}'::jsonb, '{"marketMapPeers":[{"peerName":"Freight Capital","peerType":"Receivables lender","rationale":"Recebíveis B2B de logística."}]}'::jsonb, '[]'::jsonb),
  ('cmp_lumen_edu', 'Lumen Educação Financeira Ltda.', 'Lumen Edu', '11456789000123', 'Edtech', 'Mensalidades parceladas', 'Brasil', 'Growth', 'Series A', 'https://www.lumenedu.com.br', 'Balanço próprio', '{"description":"Edtech com carteira parcelada e pagamentos recorrentes.","credit_product":"Crédito estudantil","receivables":["Mensalidades","Boletos"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.70}}'::jsonb, '{"marketMapPeers":[{"peerName":"Tuition Capital","peerType":"Education receivables","rationale":"Benchmark de FIDC de mensalidades."}]}'::jsonb, '[]'::jsonb),
  ('cmp_verde_agro', 'Verde Agro Capital Ltda.', 'Verde Agro', '42999888000166', 'Agfintech', 'Crédito para insumos', 'Brasil', 'Scale-up', 'Series B', 'https://www.verdeagro.com.br', 'Balanço próprio + linhas bilaterais', '{"description":"Agfintech com crédito para insumos e recebíveis do agronegócio.","credit_product":"Crédito de safra","receivables":["CPR","Duplicatas"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.81}}'::jsonb, '{"marketMapPeers":[{"peerName":"Agro FIDC Prime","peerType":"Agro receivables","rationale":"Comparável por lastro em CPR."}]}'::jsonb, '[]'::jsonb),
  ('cmp_prisma_auto', 'Prisma Auto Finance Ltda.', 'Prisma Auto', '36789012000145', 'Mobility', 'Financiamento automotivo leve', 'Brasil', 'Growth', 'Series A', 'https://www.prismaauto.com.br', 'Debênture privada piloto', '{"description":"Plataforma de mobilidade com financiamento leve e cobrança digital.","credit_product":"Parcelamento automotivo","receivables":["Parcelas","Duplicatas"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.74}}'::jsonb, '{"marketMapPeers":[{"peerName":"Auto Parcel","peerType":"Auto credit","rationale":"Benchmark de carteira parcelada automotiva."}]}'::jsonb, '[]'::jsonb),
  ('cmp_safra_shop', 'Safra Shop Finance Ltda.', 'Safra Shop', '55667788000190', 'Retail Tech', 'Embedded lending para sellers', 'Brasil', 'Scale-up', 'Series B', 'https://www.safrashop.com.br', 'Caixa + linhas bilaterais', '{"description":"Marketplace com oferta embutida de crédito e antecipação para sellers.","credit_product":"Antecipação para sellers","receivables":["Cartão","Pix parcelado"]}'::jsonb, '{"enrichment":{"sourceConfidence":0.80}}'::jsonb, '{"marketMapPeers":[{"peerName":"Arbo Pay","peerType":"Embedded finance","rationale":"Comparável em distribuição SMB."}]}'::jsonb, '[]'::jsonb)
on conflict (id) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  cnpj = excluded.cnpj,
  segment = excluded.segment,
  subsegment = excluded.subsegment,
  geography = excluded.geography,
  company_type = excluded.company_type,
  stage = excluded.stage,
  website = excluded.website,
  current_funding_structure = excluded.current_funding_structure,
  observed_payload = excluded.observed_payload,
  inferred_payload = excluded.inferred_payload,
  estimated_payload = excluded.estimated_payload,
  source_trace = excluded.source_trace;
