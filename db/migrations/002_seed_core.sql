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
