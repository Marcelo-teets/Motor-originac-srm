-- Capital-market public data foundation for CVM offers, funds and securitization datasets.
-- Reuses public.bronze_historical_records as the raw landing layer.

create extension if not exists pgcrypto;

create table if not exists public.capital_market_dataset_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_id uuid references public.source_catalog(id) on delete set null,
  trigger_type text not null default 'manual',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  files_processed integer not null default 0,
  records_seen integer not null default 0,
  bronze_rows_written integer not null default 0,
  events_written integer not null default 0,
  signals_written integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capital_market_dataset_runs_status_check
    check (status in ('running', 'completed', 'partial', 'failed'))
);

create index if not exists idx_capital_market_dataset_runs_dataset_started
  on public.capital_market_dataset_runs(dataset_code, started_at desc);

create table if not exists public.capital_market_events (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  source_code text not null,
  record_key text not null,
  event_type text not null,
  instrument_type text not null,
  issuer_company_id uuid references public.companies(id) on delete set null,
  issuer_cnpj text,
  issuer_name text,
  fund_cnpj text,
  fund_name text,
  security_code text,
  offer_id text,
  series text,
  status text,
  reference_date date,
  event_date date,
  maturity_date date,
  volume numeric,
  currency text not null default 'BRL',
  source_url text not null,
  source_resource_name text not null,
  source_file_name text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capital_market_events_dataset_record_unique unique(dataset_code, record_key)
);

create index if not exists idx_capital_market_events_instrument_date
  on public.capital_market_events(instrument_type, coalesce(event_date, reference_date) desc);
create index if not exists idx_capital_market_events_issuer_cnpj
  on public.capital_market_events(issuer_cnpj) where issuer_cnpj is not null;
create index if not exists idx_capital_market_events_fund_cnpj
  on public.capital_market_events(fund_cnpj) where fund_cnpj is not null;
create index if not exists idx_capital_market_events_company
  on public.capital_market_events(issuer_company_id, coalesce(event_date, reference_date) desc)
  where issuer_company_id is not null;

alter table public.capital_market_dataset_runs enable row level security;
alter table public.capital_market_events enable row level security;

drop policy if exists service_role_all_capital_market_dataset_runs on public.capital_market_dataset_runs;
create policy service_role_all_capital_market_dataset_runs
  on public.capital_market_dataset_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists authenticated_select_capital_market_dataset_runs on public.capital_market_dataset_runs;
create policy authenticated_select_capital_market_dataset_runs
  on public.capital_market_dataset_runs
  for select
  to authenticated
  using (true);

drop policy if exists service_role_all_capital_market_events on public.capital_market_events;
create policy service_role_all_capital_market_events
  on public.capital_market_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists authenticated_select_capital_market_events on public.capital_market_events;
create policy authenticated_select_capital_market_events
  on public.capital_market_events
  for select
  to authenticated
  using (true);

grant all on public.capital_market_dataset_runs to service_role;
grant all on public.capital_market_events to service_role;
grant select on public.capital_market_dataset_runs to authenticated;
grant select on public.capital_market_events to authenticated;

create temporary table _capital_market_source_seed (
  name text,
  url text,
  category text,
  scope text,
  priority integer,
  criticality text,
  frequency text,
  status text,
  validation_rule text,
  metadata jsonb,
  source_type text,
  auth_requirement text,
  rate_limit_notes text,
  health text
) on commit drop;

insert into _capital_market_source_seed (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, rate_limit_notes, health
) values
  (
    'CVM Ofertas Publicas de Distribuicao',
    'https://dados.cvm.gov.br/dataset/oferta-distrib',
    'regulatory', 'BR', 1, 'high', 'daily', 'real',
    'Validar schema e deduplicar por identificador da oferta, emissor, ativo, data e hash do registro.',
    jsonb_build_object('code','src_cvm_offers','datasetCode','cvm_offers','packageId','oferta-distrib','tier','tier_1_official_regulatory','instruments',jsonb_build_array('DEBENTURE','CRI','CRA','FIDC','FII')),
    'dataset_api', 'none', 'Sem chave; aplicar backoff e uma coleta global por ciclo.', 'healthy'
  ),
  (
    'CVM Cadastro de Fundos Classes e Subclasses',
    'https://dados.cvm.gov.br/dataset/fi-cad',
    'regulatory', 'BR', 1, 'high', 'daily', 'real',
    'Validar CNPJ, situacao cadastral, classe/subclasse e data de referencia.',
    jsonb_build_object('code','src_cvm_fund_registry','datasetCode','cvm_fund_registry','packageId','fi-cad','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; aplicar backoff e uma coleta global por ciclo.', 'healthy'
  ),
  (
    'CVM FIDC Informes Mensais',
    'https://dados.cvm.gov.br/dataset/fidc-doc-inf_mensal',
    'regulatory', 'BR', 1, 'high', 'weekly', 'real',
    'Validar competencia, CNPJ do fundo/classe e reconciliar PL, carteira, provisoes e inadimplencia.',
    jsonb_build_object('code','src_cvm_fidc_monthly','datasetCode','cvm_fidc_monthly','packageId','fidc-doc-inf_mensal','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos mensais atualizados semanalmente.', 'healthy'
  ),
  (
    'CVM CRI Informes Mensais',
    'https://dados.cvm.gov.br/dataset/securit-doc-inf_mensal_cri',
    'regulatory', 'BR', 1, 'high', 'weekly', 'real',
    'Validar competencia, securitizadora, serie, saldo e eventos do certificado.',
    jsonb_build_object('code','src_cvm_cri_monthly','datasetCode','cvm_cri_monthly','packageId','securit-doc-inf_mensal_cri','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos anuais atualizados semanalmente.', 'healthy'
  ),
  (
    'CVM CRA Informes Mensais',
    'https://dados.cvm.gov.br/dataset/securit-doc-inf_mensal_cra',
    'regulatory', 'BR', 1, 'high', 'weekly', 'real',
    'Validar competencia, securitizadora, serie, saldo e eventos do certificado.',
    jsonb_build_object('code','src_cvm_cra_monthly','datasetCode','cvm_cra_monthly','packageId','securit-doc-inf_mensal_cra','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos anuais atualizados semanalmente.', 'healthy'
  ),
  (
    'CVM FII Informes Mensais',
    'https://dados.cvm.gov.br/dataset/fii-doc-inf_mensal',
    'regulatory', 'BR', 1, 'high', 'weekly', 'real',
    'Validar competencia, CNPJ do fundo, patrimonio, carteira e passivos.',
    jsonb_build_object('code','src_cvm_fii_monthly','datasetCode','cvm_fii_monthly','packageId','fii-doc-inf_mensal','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos mensais atualizados semanalmente.', 'healthy'
  );

update public.source_catalog existing
set
  name = seed.name,
  url = seed.url,
  category = seed.category,
  scope = seed.scope,
  priority = seed.priority,
  criticality = seed.criticality,
  frequency = seed.frequency,
  status = seed.status,
  validation_rule = seed.validation_rule,
  metadata = existing.metadata || seed.metadata,
  source_type = seed.source_type,
  auth_requirement = seed.auth_requirement,
  rate_limit_notes = seed.rate_limit_notes,
  health = seed.health,
  updated_at = now()
from _capital_market_source_seed seed
where existing.metadata ->> 'code' = seed.metadata ->> 'code'
   or existing.name = seed.name;

insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, rate_limit_notes, health
)
select
  seed.name, seed.url, seed.category, seed.scope, seed.priority, seed.criticality, seed.frequency, seed.status,
  seed.validation_rule, seed.metadata, seed.source_type, seed.auth_requirement, seed.rate_limit_notes, seed.health
from _capital_market_source_seed seed
where not exists (
  select 1
  from public.source_catalog existing
  where existing.metadata ->> 'code' = seed.metadata ->> 'code'
     or existing.name = seed.name
);

create unique index if not exists uq_company_signals_capital_market_record
  on public.company_signals(company_id, signal_type, ((metadata ->> 'capitalMarketRecordKey')))
  where signal_type = 'capital_market_event' and metadata ? 'capitalMarketRecordKey';

create or replace function public.sync_capital_market_company_signals(p_dataset_code text default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  update public.capital_market_events event
  set issuer_company_id = company.id,
      updated_at = now()
  from public.companies company
  where event.issuer_company_id is null
    and event.issuer_cnpj is not null
    and regexp_replace(coalesce(company.cnpj, ''), '[^0-9]', '', 'g') = event.issuer_cnpj
    and (p_dataset_code is null or event.dataset_code = p_dataset_code);

  insert into public.company_signals (
    id,
    company_id,
    source_id,
    monitoring_output_id,
    signal_type,
    signal_label,
    strength,
    confidence,
    is_explicit,
    evidence_url,
    evidence_text,
    observed_at,
    metadata,
    signal_strength,
    confidence_score,
    evidence_payload,
    observed_vs_inferred,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    event.issuer_company_id,
    source.id,
    null,
    'capital_market_event',
    concat(event.instrument_type, ' · ', replace(event.event_type, '_', ' ')),
    case
      when event.event_type = 'public_offering' then 90
      when event.event_type = 'fund_registration' then 76
      else 66
    end,
    96,
    true,
    event.source_url,
    concat_ws(' · ', coalesce(event.issuer_name, event.fund_name), event.instrument_type, event.status, event.volume::text),
    event.observed_at,
    jsonb_build_object(
      'capitalMarketEventId', event.id,
      'capitalMarketRecordKey', event.record_key,
      'datasetCode', event.dataset_code,
      'sourceCode', event.source_code,
      'instrumentType', event.instrument_type,
      'eventType', event.event_type,
      'offerId', event.offer_id,
      'securityCode', event.security_code,
      'referenceDate', event.reference_date,
      'eventDate', event.event_date,
      'maturityDate', event.maturity_date,
      'volume', event.volume,
      'status', event.status
    ),
    case
      when event.event_type = 'public_offering' then 90
      when event.event_type = 'fund_registration' then 76
      else 66
    end,
    0.96,
    jsonb_build_object(
      'label', concat(event.instrument_type, ' · ', replace(event.event_type, '_', ' ')),
      'summary', concat_ws(' · ', coalesce(event.issuer_name, event.fund_name), event.instrument_type, event.status, event.volume::text),
      'sourceUrl', event.source_url,
      'datasetCode', event.dataset_code,
      'recordKey', event.record_key
    ),
    'observed',
    now(),
    now()
  from public.capital_market_events event
  left join public.source_catalog source
    on source.metadata ->> 'code' = event.source_code
  where event.issuer_company_id is not null
    and (p_dataset_code is null or event.dataset_code = p_dataset_code)
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.sync_capital_market_company_signals(text) from public;
grant execute on function public.sync_capital_market_company_signals(text) to service_role;

comment on table public.capital_market_events is
  'Camada normalizada de eventos e snapshots de mercado de capitais originados de datasets oficiais da CVM.';
comment on table public.capital_market_dataset_runs is
  'Auditoria de cada ciclo global de ingestao dos datasets de mercado de capitais.';
comment on function public.sync_capital_market_company_signals(text) is
  'Resolve emissores por CNPJ e transforma eventos CVM em sinais explícitos vinculados às empresas do Motor.';
