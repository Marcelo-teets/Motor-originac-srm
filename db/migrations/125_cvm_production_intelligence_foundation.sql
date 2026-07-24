-- CVM production intelligence layer.
-- Separates legal roles, typed metrics and commercial targets so official
-- CVM records feed origination without promoting securitizers or funds as leads.

create extension if not exists pgcrypto;

alter table public.capital_market_dataset_runs
  add column if not exists entity_links_written integer not null default 0,
  add column if not exists metrics_written integer not null default 0;

create table if not exists public.capital_market_entity_links (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  record_key text not null,
  content_hash text not null,
  entity_key text not null,
  entity_role text not null,
  entity_cnpj text,
  entity_name text,
  company_id uuid references public.companies(id) on delete set null,
  is_primary_origination_target boolean not null default false,
  resolution_confidence numeric not null default 0.5,
  source_fields jsonb not null default '[]'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capital_market_entity_links_event_fk
    foreign key (dataset_code, record_key)
    references public.capital_market_events(dataset_code, record_key)
    on delete cascade,
  constraint capital_market_entity_links_role_check
    check (entity_role in (
      'issuer', 'securitizer', 'debtor', 'originator', 'assignor', 'fund',
      'administrator', 'manager', 'custodian', 'coordinator',
      'fiduciary_agent', 'auditor'
    )),
  constraint capital_market_entity_links_confidence_check
    check (resolution_confidence between 0 and 1),
  constraint capital_market_entity_links_cnpj_check
    check (entity_cnpj is null or entity_cnpj ~ '^[0-9]{14}$'),
  constraint capital_market_entity_links_unique
    unique (dataset_code, record_key, entity_role, entity_key)
);

create index if not exists idx_capital_market_entity_links_company
  on public.capital_market_entity_links(company_id, observed_at desc)
  where company_id is not null;
create index if not exists idx_capital_market_entity_links_cnpj
  on public.capital_market_entity_links(entity_cnpj, observed_at desc)
  where entity_cnpj is not null;
create index if not exists idx_capital_market_entity_links_primary
  on public.capital_market_entity_links(dataset_code, record_key, company_id)
  where is_primary_origination_target;
create index if not exists idx_capital_market_entity_links_current_hash
  on public.capital_market_entity_links(dataset_code, record_key, content_hash);

create table if not exists public.capital_market_metrics (
  id uuid primary key default gen_random_uuid(),
  dataset_code text not null,
  record_key text not null,
  content_hash text not null,
  metric_code text not null,
  metric_label text,
  metric_value numeric not null,
  metric_unit text not null,
  reference_date date,
  measurement_scope text,
  source_column text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capital_market_metrics_event_fk
    foreign key (dataset_code, record_key)
    references public.capital_market_events(dataset_code, record_key)
    on delete cascade,
  constraint capital_market_metrics_unit_check
    check (metric_unit in ('BRL', 'PERCENT', 'COUNT', 'DAYS', 'RATIO')),
  constraint capital_market_metrics_unique
    unique (dataset_code, record_key, metric_code, source_column)
);

create index if not exists idx_capital_market_metrics_code_reference
  on public.capital_market_metrics(metric_code, reference_date desc);
create index if not exists idx_capital_market_metrics_record
  on public.capital_market_metrics(dataset_code, record_key, content_hash);

alter table public.capital_market_entity_links enable row level security;
alter table public.capital_market_metrics enable row level security;

drop policy if exists service_role_all_capital_market_entity_links on public.capital_market_entity_links;
create policy service_role_all_capital_market_entity_links
  on public.capital_market_entity_links
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists authenticated_select_capital_market_entity_links on public.capital_market_entity_links;
create policy authenticated_select_capital_market_entity_links
  on public.capital_market_entity_links
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists service_role_all_capital_market_metrics on public.capital_market_metrics;
create policy service_role_all_capital_market_metrics
  on public.capital_market_metrics
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists authenticated_select_capital_market_metrics on public.capital_market_metrics;
create policy authenticated_select_capital_market_metrics
  on public.capital_market_metrics
  for select
  to authenticated
  using ((select auth.uid()) is not null);

revoke all on public.capital_market_entity_links from public, anon;
revoke all on public.capital_market_metrics from public, anon;
revoke insert, update, delete, truncate, references, trigger
  on public.capital_market_entity_links from authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.capital_market_metrics from authenticated;
grant all on public.capital_market_entity_links to service_role;
grant all on public.capital_market_metrics to service_role;
grant select on public.capital_market_entity_links to authenticated;
grant select on public.capital_market_metrics to authenticated;

create temporary table _cvm_intelligence_source_seed (
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

insert into _cvm_intelligence_source_seed (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, rate_limit_notes, health
) values
  (
    'CVM Informe Mensal de Outros Titulos de Securitizacao',
    'https://dados.cvm.gov.br/dataset/securit-doc-inf_mensal_ots',
    'regulatory', 'BR', 1, 'high', 'weekly', 'partial',
    'Validar competencia, papeis juridicos, serie, saldo devedor e instrumento.',
    jsonb_build_object('code','src_cvm_securitization_ots','datasetCode','cvm_securitization_ots','packageId','securit-doc-inf_mensal_ots','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivo oficial atualizado periodicamente.', 'degraded'
  ),
  (
    'CVM Fundos Documentos Eventuais e Demonstracoes',
    'https://dados.cvm.gov.br/dataset/fi-doc-eventual',
    'regulatory', 'BR', 1, 'high', 'weekly', 'partial',
    'Validar fundo, tipo documental, versao, data de entrega e link oficial.',
    jsonb_build_object('code','src_cvm_fund_documents','datasetCode','cvm_fund_documents','packageId','fi-doc-eventual','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos anuais atualizados semanalmente.', 'degraded'
  ),
  (
    'CVM Formulario de Referencia - Estrutura de Capital',
    'https://dados.cvm.gov.br/dataset/cia_aberta-doc-fre',
    'regulatory', 'BR', 1, 'high', 'weekly', 'partial',
    'Validar CNPJ, data de referencia, versao, estrutura de capital e valores mobiliarios.',
    jsonb_build_object('code','src_cvm_fre_capital_structure','datasetCode','cvm_company_fre','packageId','cia_aberta-doc-fre','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos anuais atualizados semanalmente.', 'degraded'
  ),
  (
    'CVM Informacoes Trimestrais de Companhias Abertas',
    'https://dados.cvm.gov.br/dataset/cia_aberta-doc-itr',
    'regulatory', 'BR', 1, 'high', 'weekly', 'partial',
    'Validar CNPJ, competencia, grupo contabil, conta, escala e valor.',
    jsonb_build_object('code','src_cvm_company_itr','datasetCode','cvm_company_itr','packageId','cia_aberta-doc-itr','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos anuais atualizados semanalmente.', 'degraded'
  ),
  (
    'CVM Demonstracoes Financeiras Padronizadas de Companhias Abertas',
    'https://dados.cvm.gov.br/dataset/cia_aberta-doc-dfp',
    'regulatory', 'BR', 1, 'high', 'weekly', 'partial',
    'Validar CNPJ, competencia, grupo contabil, conta, escala e valor.',
    jsonb_build_object('code','src_cvm_company_dfp','datasetCode','cvm_company_dfp','packageId','cia_aberta-doc-dfp','tier','tier_1_official_regulatory'),
    'dataset_api', 'none', 'Sem chave; arquivos anuais atualizados semanalmente.', 'degraded'
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
  validation_rule = seed.validation_rule,
  metadata = existing.metadata || seed.metadata,
  source_type = seed.source_type,
  auth_requirement = seed.auth_requirement,
  rate_limit_notes = seed.rate_limit_notes,
  updated_at = now()
from _cvm_intelligence_source_seed seed
where existing.metadata ->> 'code' = seed.metadata ->> 'code'
   or existing.name = seed.name;

insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, rate_limit_notes, health
)
select
  seed.name, seed.url, seed.category, seed.scope, seed.priority, seed.criticality, seed.frequency, seed.status,
  seed.validation_rule, seed.metadata, seed.source_type, seed.auth_requirement, seed.rate_limit_notes, seed.health
from _cvm_intelligence_source_seed seed
where not exists (
  select 1
  from public.source_catalog existing
  where existing.metadata ->> 'code' = seed.metadata ->> 'code'
     or existing.name = seed.name
);

create unique index if not exists uq_company_signals_capital_market_signal_key
  on public.company_signals(company_id, signal_type, ((metadata ->> 'capitalMarketSignalKey')))
  where metadata ? 'capitalMarketSignalKey';
