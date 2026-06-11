-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
-- DO NOT RUN from local migrations. This file documents the live source catalog seed for historical backfills.

begin;

insert into public.source_catalog (
  id,
  name,
  source_type,
  category,
  status,
  health,
  auth_requirement,
  metadata,
  rate_limit_notes
) values
  (
    'cvm_fidc_inf_mensal',
    'CVM FIDC Informe Mensal',
    'public_file',
    'historical_backfill',
    'active',
    'healthy',
    null,
    jsonb_build_object(
      'country', 'BR',
      'cadence', 'monthly',
      'landing_table', 'bronze_historical_records',
      'dataset_code', 'cvm_fidc_inf_mensal',
      'source_url', 'https://dados.cvm.gov.br/dados/FIDC/DOC/INF_MENSAL/DADOS/'
    ),
    'Public CVM ZIP files; retry transient download failures before failing the workflow.'
  ),
  (
    'bcb_sgs_macro',
    'Banco Central SGS Macro Series',
    'public_api',
    'historical_backfill',
    'active',
    'healthy',
    null,
    jsonb_build_object(
      'country', 'BR',
      'cadence', 'daily_or_monthly',
      'landing_table', 'macro_series_observations',
      'default_series', jsonb_build_array('20714', '21082', '21112', '25434'),
      'source_url', 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados'
    ),
    'BCB SGS accepts date windows; loaders split long ranges into requests of at most 10 years.'
  )
on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  category = excluded.category,
  status = excluded.status,
  health = excluded.health,
  auth_requirement = excluded.auth_requirement,
  metadata = excluded.metadata,
  rate_limit_notes = excluded.rate_limit_notes,
  updated_at = now();

commit;
