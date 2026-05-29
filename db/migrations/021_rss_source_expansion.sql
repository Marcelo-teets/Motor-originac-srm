-- RSS source expansion for origination monitoring.

insert into source_catalog (id, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
values
  ('src_fidc_market_rss', 'FIDC Market Signals RSS', 'rss', 'DCM market intelligence', 'none', 'real', '{"code":"src_fidc_market_rss","provider":"google-news-rss","queryTemplate":"{company} FIDC recebiveis securitizacao"}'::jsonb, 'Public RSS query.', 'healthy'),
  ('src_dcm_funding_rss', 'DCM Funding Signals RSS', 'rss', 'Funding signals', 'none', 'real', '{"code":"src_dcm_funding_rss","provider":"google-news-rss","queryTemplate":"{company} captacao divida debenture funding"}'::jsonb, 'Public RSS query.', 'healthy')
on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  category = excluded.category,
  auth_requirement = excluded.auth_requirement,
  status = excluded.status,
  metadata = excluded.metadata,
  rate_limit_notes = excluded.rate_limit_notes,
  health = excluded.health,
  updated_at = now();
