-- Canonical source lineage for Banco Central BCBase identity evidence.
-- Adds the specific official source used by CandidateBcbIdentityService and
-- backfills historical candidate_official_enrichments that were persisted
-- before the catalog row existed.

with updated as (
  update public.source_catalog
  set
    name = 'Banco Central BCBase - Entidades Supervisionadas',
    source_type = 'dataset_api',
    category = 'regulated_financials',
    auth_requirement = 'none',
    status = 'real',
    health = 'healthy',
    rate_limit_notes = 'API OData oficial; uso para identidade de instituições reguladas com match de alta confiança.',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'code', 'src_banco_central_do_brasil_dados_abertos',
      'provider', 'bcb',
      'baseUrl', 'https://olinda.bcb.gov.br/olinda/servico/BcBase/versao/v2/odata/',
      'captureMode', 'official_odata_registry',
      'refreshFrequency', 'daily',
      'entityKey', 'cnpj',
      'accessCost', 'free',
      'official', true,
      'implementationPhase', 'runtime_active',
      'datasetCode', 'bcb_bcbase_entities_candidates'
    ),
    updated_at = now()
  where metadata->>'code' = 'src_banco_central_do_brasil_dados_abertos'
  returning id
), inserted as (
  insert into public.source_catalog (
    name, source_type, category, auth_requirement, status, metadata,
    rate_limit_notes, health
  )
  select
    'Banco Central BCBase - Entidades Supervisionadas',
    'dataset_api',
    'regulated_financials',
    'none',
    'real',
    jsonb_build_object(
      'code', 'src_banco_central_do_brasil_dados_abertos',
      'provider', 'bcb',
      'baseUrl', 'https://olinda.bcb.gov.br/olinda/servico/BcBase/versao/v2/odata/',
      'captureMode', 'official_odata_registry',
      'refreshFrequency', 'daily',
      'entityKey', 'cnpj',
      'accessCost', 'free',
      'official', true,
      'implementationPhase', 'runtime_active',
      'datasetCode', 'bcb_bcbase_entities_candidates'
    ),
    'API OData oficial; uso para identidade de instituições reguladas com match de alta confiança.',
    'healthy'
  where not exists (
    select 1 from public.source_catalog
    where metadata->>'code' = 'src_banco_central_do_brasil_dados_abertos'
  )
  returning id
), canonical_source as (
  select id from updated
  union all
  select id from inserted
  union all
  select id
  from public.source_catalog
  where metadata->>'code' = 'src_banco_central_do_brasil_dados_abertos'
  limit 1
)
update public.candidate_official_enrichments e
set source_id = s.id
from canonical_source s
where e.dataset_code = 'bcb_bcbase_entities_candidates'
  and e.source_id is null;

comment on table public.candidate_official_enrichments is
  'Official candidate enrichment facts with source_catalog lineage; BCB identity evidence uses src_banco_central_do_brasil_dados_abertos.';
