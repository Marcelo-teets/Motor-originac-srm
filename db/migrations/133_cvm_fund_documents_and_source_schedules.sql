begin;

create table if not exists public.source_schedule_registry (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.source_catalog(id) on delete cascade,
  runner text not null check (runner in (
    'bounded_capture', 'capital_market', 'strategic_public', 'public_bulk',
    'bndes', 'finep', 'agentetome', 'fidcs', 'source_probe', 'manual_only'
  )),
  cadence text not null check (cadence in ('frequent', 'daily', 'weekly', 'monthly', 'quarterly', 'manual')),
  cron_utc text,
  workflow_file text,
  enabled boolean not null default true,
  max_rows integer check (max_rows is null or max_rows > 0),
  timezone text not null default 'UTC',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_source_schedule_registry_runner_cadence
  on public.source_schedule_registry (runner, cadence, enabled);

alter table public.source_schedule_registry enable row level security;
revoke all on table public.source_schedule_registry from anon, authenticated;
grant select, insert, update, delete on table public.source_schedule_registry to service_role;

insert into public.source_schedule_registry (
  source_id, runner, cadence, cron_utc, workflow_file, enabled, max_rows, notes, metadata, updated_at
)
select
  s.id,
  case
    when s.metadata->>'code' in (
      'src_cvm_offers', 'src_cvm_fund_registry', 'src_cvm_fidc_monthly', 'src_cvm_cri_monthly',
      'src_cvm_cra_monthly', 'src_cvm_fii_monthly', 'src_cvm_securitization_ots',
      'src_cvm_fund_documents', 'src_cvm_fundos_documentos_entrega',
      'src_cvm_fre_capital_structure', 'src_cvm_company_itr', 'src_cvm_company_dfp'
    ) then 'capital_market'
    when s.metadata->>'code' = 'src_bndes_financing_operations' then 'bndes'
    when s.metadata->>'code' = 'src_finep_financing_operations' then 'finep'
    when s.metadata->>'code' in ('src_agentetome_api', 'src_fidcs_com_br') then 'bounded_capture'
    when s.metadata->>'code' in (
      'src_cgu_transparencia_bulk', 'src_compras_gov_contracts',
      'src_rfb_cnpj_bulk', 'src_pgfn_divida_ativa_bulk'
    ) then 'public_bulk'
    when s.status = 'planned' then 'source_probe'
    else 'bounded_capture'
  end as runner,
  case
    when s.metadata->>'code' in ('src_cvm_offers', 'src_cvm_fundos_documentos_entrega') then 'daily'
    when s.metadata->>'code' = 'src_cvm_fund_documents' then 'weekly'
    when s.metadata->>'code' like 'src_cvm_%' then 'weekly'
    when lower(coalesce(s.source_type, '')) = 'rss'
      or lower(coalesce(s.category, '')) like '%media%'
      or lower(coalesce(s.category, '')) like '%news%' then 'frequent'
    when s.metadata->>'code' in ('src_cgu_transparencia_bulk', 'src_compras_gov_contracts') then 'daily'
    when s.metadata->>'code' in ('src_rfb_cnpj_bulk', 'src_pgfn_divida_ativa_bulk') then 'monthly'
    when s.source_type like 'bulk_%' then 'monthly'
    when s.metadata->>'code' in ('src_bndes_financing_operations', 'src_finep_financing_operations') then 'weekly'
    when s.status = 'planned' then 'weekly'
    else 'daily'
  end as cadence,
  case
    when s.metadata->>'code' = 'src_cvm_offers' then '20 9 * * *'
    when s.metadata->>'code' = 'src_cvm_fundos_documentos_entrega' then '5 10 * * *'
    when s.metadata->>'code' = 'src_cvm_fund_documents' then '35 10 * * 1'
    when s.metadata->>'code' like 'src_cvm_%' then '40 10 * * 1'
    when lower(coalesce(s.source_type, '')) = 'rss'
      or lower(coalesce(s.category, '')) like '%media%'
      or lower(coalesce(s.category, '')) like '%news%' then '0 2,8,14,20 * * *'
    when s.metadata->>'code' = 'src_cgu_transparencia_bulk' then '35 10 * * *'
    when s.metadata->>'code' = 'src_compras_gov_contracts' then '20 11 * * 0'
    when s.metadata->>'code' in ('src_rfb_cnpj_bulk', 'src_pgfn_divida_ativa_bulk') then '50 11 5 * *'
    when s.source_type like 'bulk_%' then '45 11 1 * *'
    when s.metadata->>'code' in ('src_bndes_financing_operations', 'src_finep_financing_operations') then '30 11 * * 1'
    when s.status = 'planned' then '0 12 * * 2'
    else '15 9 * * *'
  end as cron_utc,
  case
    when s.metadata->>'code' in ('src_cvm_fund_documents', 'src_cvm_fundos_documentos_entrega')
      then '.github/workflows/cvm-fund-documents-schedule.yml'
    when s.metadata->>'code' like 'src_cvm_%' then '.github/workflows/capital-market-ingestion.yml'
    when s.metadata->>'code' = 'src_bndes_financing_operations' then '.github/workflows/bndes-automatic-datastore.yml'
    when s.metadata->>'code' = 'src_finep_financing_operations' then '.github/workflows/finep-source-probe.yml'
    when s.metadata->>'code' in (
      'src_cgu_transparencia_bulk', 'src_compras_gov_contracts',
      'src_rfb_cnpj_bulk', 'src_pgfn_divida_ativa_bulk'
    ) then '.github/workflows/public-bulk-ingestion.yml'
    when s.status = 'planned' then '.github/workflows/source-activation-probes.yml'
    else '.github/workflows/capture.yml'
  end as workflow_file,
  s.status <> 'retired' as enabled,
  case
    when s.metadata->>'code' = 'src_cvm_offers' then 50000
    when s.metadata->>'code' = 'src_cvm_fundos_documentos_entrega' then 25000
    when s.metadata->>'code' = 'src_cvm_fund_documents' then 50000
    when s.metadata->>'code' like 'src_cvm_%' then 100000
    when s.source_type like 'bulk_%' then 250000
    else null
  end as max_rows,
  case
    when s.status = 'planned' then 'Scheduled activation probe; ingestion remains blocked until the connector and any required authorization are ready.'
    when s.status = 'retired' then 'Retired source; schedule kept disabled for audit history.'
    else 'Periodic production action assigned by source governance.'
  end as notes,
  jsonb_build_object('sourceCode', s.metadata->>'code', 'generatedBy', 'migration_133') as metadata,
  now()
from public.source_catalog s
on conflict (source_id) do update set
  runner = excluded.runner,
  cadence = excluded.cadence,
  cron_utc = excluded.cron_utc,
  workflow_file = excluded.workflow_file,
  enabled = excluded.enabled,
  max_rows = excluded.max_rows,
  notes = excluded.notes,
  metadata = public.source_schedule_registry.metadata || excluded.metadata,
  updated_at = now();

update public.source_catalog s
set metadata = coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
      'schedulePolicy', jsonb_build_object(
        'runner', r.runner,
        'cadence', r.cadence,
        'cronUtc', r.cron_utc,
        'workflowFile', r.workflow_file,
        'enabled', r.enabled,
        'maxRows', r.max_rows,
        'timezone', r.timezone
      )
    ),
    frequency = r.cadence,
    updated_at = now()
from public.source_schedule_registry r
where r.source_id = s.id;

update public.source_catalog
set status = 'real',
    health = 'healthy',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'datasetCode', 'cvm_fund_document_deliveries',
      'packageId', 'fi-doc-entrega',
      'officialCadence', 'daily_current_two_months_weekly_older_months',
      'parser', 'zip_csv'
    ),
    updated_at = now()
where metadata->>'code' = 'src_cvm_fundos_documentos_entrega';

update public.source_catalog
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'datasetCode', 'cvm_fund_documents',
      'packageId', 'fi-doc-eventual',
      'officialCadence', 'weekly',
      'parser', 'direct_csv_url_filename'
    ),
    updated_at = now()
where metadata->>'code' = 'src_cvm_fund_documents';

insert into public.data_archive_policies (
  table_name, dataset_code, retention_mode, hot_retention_days, date_column,
  enabled, allow_prune, excel_sheet_prefix, notes
)
values
  ('bronze_historical_records', 'cvm_fund_documents', 'full_row', 1, 'ingested_at', true, true, 'Bronze_CVM_Fund_Documents', 'Keep one-day replay window after normalization; archive full source rows externally.'),
  ('bronze_historical_records', 'cvm_fund_document_deliveries', 'full_row', 1, 'ingested_at', true, true, 'Bronze_CVM_Fund_Deliveries', 'Keep one-day replay window after normalization; archive full source rows externally.')
on conflict (table_name, dataset_code) do update set
  retention_mode = excluded.retention_mode,
  hot_retention_days = excluded.hot_retention_days,
  date_column = excluded.date_column,
  enabled = excluded.enabled,
  allow_prune = excluded.allow_prune,
  excel_sheet_prefix = excluded.excel_sheet_prefix,
  notes = excluded.notes,
  updated_at = now();

create or replace view public.source_schedule_coverage
with (security_invoker = true)
as
select
  s.id as source_id,
  s.name,
  s.metadata->>'code' as source_code,
  s.url as source_url,
  s.source_type,
  s.auth_requirement,
  s.status,
  s.health,
  s.metadata as source_metadata,
  r.runner,
  r.cadence,
  r.cron_utc,
  r.workflow_file,
  r.enabled,
  r.max_rows,
  case
    when s.status = 'retired' then 'retired'
    when r.source_id is null then 'missing_schedule'
    when r.enabled then 'scheduled'
    else 'blocked_or_disabled'
  end as schedule_status,
  r.notes,
  r.updated_at
from public.source_catalog s
left join public.source_schedule_registry r on r.source_id = s.id;

revoke all on public.source_schedule_coverage from anon, authenticated;
grant select on public.source_schedule_coverage to service_role;

commit;
