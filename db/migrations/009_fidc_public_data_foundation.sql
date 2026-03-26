create table if not exists fidc_funds (
  id uuid primary key default gen_random_uuid(),
  cnpj_fundo text,
  nome_fundo text not null,
  razao_social text,
  fund_type text,
  status text,
  source_id text not null,
  source_record_id text,
  reference_date date,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fidc_funds_cnpj on fidc_funds(cnpj_fundo);
create index if not exists idx_fidc_funds_source on fidc_funds(source_id, reference_date desc);

create table if not exists fidc_fund_classes (
  id uuid primary key default gen_random_uuid(),
  fidc_fund_id uuid not null references fidc_funds(id) on delete cascade,
  codigo_anbima text,
  isin text,
  class_name text,
  class_name_2 text,
  tipo_classe_cota text,
  situacao_atual text,
  data_primeiro_aporte date,
  data_inicio date,
  data_inicio_divulgacao_cota date,
  data_encerramento date,
  restrito boolean,
  investidor_qualificado boolean,
  fundo_adaptado_icvm_175 boolean,
  data_fundo_adaptado_icvm_175 date,
  responsabilidade_ltda boolean,
  source_id text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_fidc_fund_classes_fund on fidc_fund_classes(fidc_fund_id);
create index if not exists idx_fidc_fund_classes_codigo on fidc_fund_classes(codigo_anbima);
create index if not exists idx_fidc_fund_classes_isin on fidc_fund_classes(isin);

create table if not exists fidc_providers (
  id uuid primary key default gen_random_uuid(),
  fidc_fund_id uuid not null references fidc_funds(id) on delete cascade,
  provider_name text not null,
  provider_cnpj text,
  role text not null,
  is_principal boolean not null default false,
  source_id text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_fidc_providers_fund on fidc_providers(fidc_fund_id);
create index if not exists idx_fidc_providers_cnpj on fidc_providers(provider_cnpj);

create table if not exists fidc_provider_public_exposure (
  id uuid primary key default gen_random_uuid(),
  provider_cnpj text not null,
  contracts_count integer not null default 0,
  payments_count integer not null default 0,
  source_id text not null,
  checked_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);
create index if not exists idx_fidc_provider_public_exposure_cnpj on fidc_provider_public_exposure(provider_cnpj, checked_at desc);

create table if not exists fidc_dataset_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  dataset_name text not null,
  resource_url text,
  reference_period text,
  status text not null,
  rows_loaded integer,
  notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_fidc_dataset_runs_source on fidc_dataset_runs(source_id, started_at desc);
