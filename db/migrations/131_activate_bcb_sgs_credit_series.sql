-- Activates the previously planned BCB credit-series source with a bounded,
-- low-volume series set. Each monitoring run fetches only the latest three
-- observations per series; the runtime cache prevents one request per company.

update public.source_catalog
set status = 'real',
    health = 'healthy',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'implementedRuntime', true,
      'implementationPhase', 'production_active',
      'captureMode', 'official_series_api_bounded',
      'provider', 'bcb_sgs',
      'official', true,
      'accessCost', 'free',
      'accessMode', 'anonymous',
      'lastNPerSeries', 3,
      'cacheTtlMs', 300000,
      'series', jsonb_build_array(
        jsonb_build_object(
          'code', 20539,
          'name', 'Saldo da carteira de crédito - Total',
          'unit', 'R$ milhões'
        ),
        jsonb_build_object(
          'code', 20631,
          'name', 'Concessões de crédito - Total',
          'unit', 'R$ milhões'
        ),
        jsonb_build_object(
          'code', 20714,
          'name', 'Taxa média de juros das operações de crédito - Total',
          'unit', '% a.a.'
        ),
        jsonb_build_object(
          'code', 21082,
          'name', 'Inadimplência da carteira de crédito - Total',
          'unit', '%'
        ),
        jsonb_build_object(
          'code', 21112,
          'name', 'Inadimplência do crédito livre PF - Total',
          'unit', '%'
        ),
        jsonb_build_object(
          'code', 25434,
          'name', 'Taxa média mensal de juros do crédito PJ - Total',
          'unit', '% a.m.'
        )
      ),
      'activatedAt', now(),
      'activationCampaign', 'mass_ingestion_2026_07_28'
    ),
    updated_at = now()
where metadata ->> 'code' = 'src_bcb_sgs_credit_series';

comment on table public.source_catalog is
  'Governed source registry. BCB credit-cycle source activated by migration 131 with official bounded SGS series.';
