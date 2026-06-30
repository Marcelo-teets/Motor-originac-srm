-- RSS source expansion for origination monitoring.
-- Idempotent: uses (name) as conflict key so it works whether source_catalog.id
-- is text (canonical dev schema) or uuid (Supabase production).

DO $$
DECLARE
  v_id_type text;
BEGIN
  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_name = 'source_catalog' AND column_name = 'id';

  IF v_id_type = 'uuid' THEN
    -- Production: id is uuid with auto-generated default; upsert by name.
    INSERT INTO source_catalog (name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
    VALUES
      ('FIDC Market Signals RSS', 'rss', 'DCM market intelligence', 'none', 'real',
       '{"code":"src_fidc_market_rss","provider":"google-news-rss","queryTemplate":"{company} FIDC recebiveis securitizacao"}'::jsonb,
       'Public RSS query.', 'healthy'),
      ('DCM Funding Signals RSS', 'rss', 'Funding signals', 'none', 'real',
       '{"code":"src_dcm_funding_rss","provider":"google-news-rss","queryTemplate":"{company} captacao divida debenture funding"}'::jsonb,
       'Public RSS query.', 'healthy')
    ON CONFLICT (name) DO UPDATE SET
      source_type      = excluded.source_type,
      category         = excluded.category,
      auth_requirement = excluded.auth_requirement,
      status           = excluded.status,
      metadata         = excluded.metadata,
      rate_limit_notes = excluded.rate_limit_notes,
      health           = excluded.health,
      updated_at       = now();
  ELSE
    -- Dev / canonical: id is text primary key; upsert by id.
    INSERT INTO source_catalog (id, name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
    VALUES
      ('src_fidc_market_rss', 'FIDC Market Signals RSS', 'rss', 'DCM market intelligence', 'none', 'real',
       '{"code":"src_fidc_market_rss","provider":"google-news-rss","queryTemplate":"{company} FIDC recebiveis securitizacao"}'::jsonb,
       'Public RSS query.', 'healthy'),
      ('src_dcm_funding_rss', 'DCM Funding Signals RSS', 'rss', 'Funding signals', 'none', 'real',
       '{"code":"src_dcm_funding_rss","provider":"google-news-rss","queryTemplate":"{company} captacao divida debenture funding"}'::jsonb,
       'Public RSS query.', 'healthy')
    ON CONFLICT (id) DO UPDATE SET
      name             = excluded.name,
      source_type      = excluded.source_type,
      category         = excluded.category,
      auth_requirement = excluded.auth_requirement,
      status           = excluded.status,
      metadata         = excluded.metadata,
      rate_limit_notes = excluded.rate_limit_notes,
      health           = excluded.health,
      updated_at       = now();
  END IF;
END $$;
