-- Neon origination intelligence runtime modules.
-- Builds on the UUID core and extended runtime migrations.
-- No Supabase auth/service_role/pg_cron assumptions are copied.

create table if not exists public.trigger_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  trigger_type text not null,
  trigger_strength integer not null default 0,
  description text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_trigger_events_company on public.trigger_events(company_id,created_at desc);

create table if not exists public.company_source_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.source_catalog(id) on delete cascade,
  metric_key text not null,
  metric_value numeric,
  metric_text text,
  metric_unit text,
  observed_at timestamptz not null default now(),
  period_start timestamptz,
  period_end timestamptz,
  confidence_score numeric(5,2) not null default 0.70,
  observed_vs_inferred text not null default 'observed',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id,source_id,metric_key,observed_at)
);
create index if not exists idx_company_source_metric_snapshots_company
  on public.company_source_metric_snapshots(company_id,observed_at desc);

create table if not exists public.company_linkedin_role_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_id uuid not null references public.source_catalog(id) on delete cascade,
  linkedin_company_url text,
  role_family text not null,
  role_title text,
  employee_count integer,
  profile_sample_size integer,
  observed_at timestamptz not null default now(),
  confidence_score numeric(5,2) not null default 0.65,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_company_linkedin_role_snapshots_company
  on public.company_linkedin_role_snapshots(company_id,observed_at desc);

create table if not exists public.origination_factor_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  dimension text not null check (dimension in ('funding_need','fidc_fit','dcm_fit','timing','executability','risk')),
  description text,
  hypothesis text not null,
  positive_direction boolean not null default true,
  default_weight numeric(8,4) not null default 1,
  decay_days integer not null default 180 check (decay_days between 1 and 3650),
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_factor_rules (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  factor_id uuid not null references public.origination_factor_catalog(id) on delete cascade,
  source_code text not null default '*',
  base_contribution numeric(8,4) not null,
  min_strength numeric(8,4) not null default 0 check (min_strength between 0 and 100),
  confidence_floor numeric(8,4) not null default 0 check (confidence_floor between 0 and 1),
  rule_version integer not null default 1,
  rationale text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(signal_type,factor_id,source_code,rule_version)
);
create index if not exists idx_source_factor_rules_signal
  on public.source_factor_rules(signal_type,source_code) where active;

create table if not exists public.company_factor_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  signal_id uuid not null references public.company_signals(id) on delete cascade,
  factor_id uuid not null references public.origination_factor_catalog(id) on delete cascade,
  rule_id uuid not null references public.source_factor_rules(id) on delete restrict,
  contribution numeric(10,4) not null,
  signal_strength numeric(8,4) not null,
  confidence_score numeric(8,6) not null check (confidence_score between 0 and 1),
  observed_at timestamptz not null,
  expires_at timestamptz,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(signal_id,factor_id,rule_id)
);
create index if not exists idx_company_factor_observations_company
  on public.company_factor_observations(company_id,factor_id,observed_at desc);

create table if not exists public.company_factor_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  factor_id uuid not null references public.origination_factor_catalog(id) on delete cascade,
  snapshot_date date not null default current_date,
  score numeric(8,4) not null check (score between 0 and 100),
  net_contribution numeric(10,4) not null,
  trend numeric(10,4) not null default 0,
  evidence_count integer not null default 0,
  latest_observed_at timestamptz,
  confidence_score numeric(8,6) not null default 0 check (confidence_score between 0 and 1),
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,factor_id,snapshot_date)
);
create index if not exists idx_company_factor_snapshots_company
  on public.company_factor_snapshots(company_id,snapshot_date desc,score desc);

create table if not exists public.source_schedule_registry (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.source_catalog(id) on delete cascade,
  runner text not null,
  cadence text not null,
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
  on public.source_schedule_registry(runner,cadence,enabled);

-- Initial factor catalog used by qualification/pattern/ranking reasoning.
insert into public.origination_factor_catalog
(code,name,dimension,description,hypothesis,positive_direction,default_weight,decay_days,version,active)
values
('credit_product_intensity','Intensidade do produto de crédito','funding_need','Crédito como produto ou infraestrutura central.','Quanto mais central o crédito, maior a dependência de funding escalável.',true,1.35,180,1,true),
('embedded_finance_pressure','Pressão de embedded finance','funding_need','Crédito embutido no fluxo comercial.','Embedded finance pode crescer antes da estrutura de funding.',true,1.30,180,1,true),
('receivables_quality','Qualidade e recorrência dos recebíveis','fidc_fit','Carteira ou fluxo recebível estruturável.','Recebíveis recorrentes e previsíveis aumentam fit para FIDC.',true,1.45,365,1,true),
('funding_gap_pressure','Pressão de funding gap','funding_need','Crescimento exige capital além do funding atual.','Funding gap antecede busca por dívida estruturada.',true,1.55,120,1,true),
('capital_mismatch_pressure','Descasamento de capital','funding_need','Prazo/custo do passivo não acompanha o ativo.','Capital mismatch cria necessidade de FIDC/DCM.',true,1.45,180,1,true),
('growth_acceleration','Aceleração de crescimento','timing','Expansão e aumento de demanda.','Aceleração operacional aumenta necessidade e timing.',true,1.20,120,1,true),
('credit_team_buildout','Formação de time de crédito','timing','Contratação em crédito, risco ou cobrança.','Time especializado antecede escala da carteira/funding.',true,1.00,180,1,true),
('dcm_market_access','Acesso e aderência a DCM','dcm_fit','Histórico de instrumentos ou estrutura compatível.','Maturidade reduz fricção de DCM.',true,1.30,365,1,true),
('vc_sponsor_signal','Sponsor institucional/VC','executability','Empresa integrante de portfólio institucional.','Sponsor institucional pode melhorar governança e execução.',true,0.90,365,1,true),
('fiscal_stress','Pressão fiscal','risk','Dívida ativa ou evento fiscal material.','Pressão fiscal aumenta urgência, mas reduz executabilidade.',false,1.35,365,1,true),
('compliance_blocker','Bloqueio de compliance','risk','Sanção ou impedimento oficial.','Sanção vigente exige diligência reforçada.',false,1.70,730,1,true)
on conflict(code) do update set
  name=excluded.name,dimension=excluded.dimension,description=excluded.description,
  hypothesis=excluded.hypothesis,positive_direction=excluded.positive_direction,
  default_weight=excluded.default_weight,decay_days=excluded.decay_days,
  version=excluded.version,active=excluded.active,updated_at=now();

-- Data API remains default-deny until explicit RLS/role mapping is reviewed.
revoke all privileges on all tables in schema public from anonymous, authenticated;
revoke all privileges on all sequences in schema public from anonymous, authenticated;
revoke all privileges on all functions in schema public from anonymous, authenticated;
