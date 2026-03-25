-- Migration: Pipeline CRM Core
-- Canonical pipeline + CRM persistence layer for MVP.

create extension if not exists pgcrypto;

create table if not exists pipeline_stage_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  stage_order integer not null unique,
  is_terminal boolean not null default false,
  created_at timestamptz not null default now()
);

insert into pipeline_stage_catalog (code, label, stage_order, is_terminal)
values
  ('potenciais_interessados', 'Potenciais Interessados', 10, false),
  ('prospeccao', 'Prospecção', 20, false),
  ('conversa_ventures', 'Conversa Ventures', 30, false),
  ('intro_empirica', 'Intro Empírica', 40, false),
  ('conversa_empirica', 'Conversa Empírica', 50, false),
  ('envio_infos', 'Envio de Infos', 60, false),
  ('envio_mandato', 'Envio Mandato', 70, false),
  ('mandato_assinado', 'Mandato Assinado', 80, false),
  ('estruturacao_produto', 'Estruturação do Produto', 90, false),
  ('captacao', 'Captação', 100, false),
  ('fechado', 'Fechado', 110, true),
  ('nao_faz_sentido', 'Não Faz Sentido', 120, true),
  ('reciclar', 'Reciclar', 130, false)
on conflict (code) do update set
  label = excluded.label,
  stage_order = excluded.stage_order,
  is_terminal = excluded.is_terminal;

alter table pipeline
  add column if not exists stage_code text,
  add column if not exists owner_name text,
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists follow_up_at timestamptz,
  add column if not exists status text not null default 'open',
  add column if not exists source text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

update pipeline
set stage_code = coalesce(stage_code, case
  when stage ilike 'Identified' then 'potenciais_interessados'
  when stage ilike 'Qualified' then 'prospeccao'
  when stage ilike 'Approach' then 'conversa_ventures'
  when stage ilike 'Structuring' then 'estruturacao_produto'
  else 'potenciais_interessados'
end)
where stage_code is null;

create index if not exists idx_pipeline_stage_code on pipeline(stage_code);
create index if not exists idx_pipeline_owner_name on pipeline(owner_name);
create index if not exists idx_pipeline_follow_up_at on pipeline(follow_up_at);

create table if not exists pipeline_stage_history (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipeline(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  from_stage_code text,
  to_stage_code text not null,
  changed_by text,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pipeline_stage_history_company on pipeline_stage_history(company_id, created_at desc);
create index if not exists idx_pipeline_stage_history_pipeline on pipeline_stage_history(pipeline_id, created_at desc);

alter table activities
  add column if not exists follow_up_at timestamptz,
  add column if not exists outcome text,
  add column if not exists notes text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists idx_activities_company_created on activities(company_id, created_at desc);
create index if not exists idx_activities_follow_up_at on activities(follow_up_at);

alter table tasks
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists activity_id uuid references activities(id) on delete set null,
  add column if not exists priority text not null default 'medium',
  add column if not exists task_type text,
  add column if not exists follow_up_at timestamptz;

create index if not exists idx_tasks_company_status on tasks(company_id, status, created_at desc);
create index if not exists idx_tasks_due_at on tasks(due_at);
create index if not exists idx_tasks_activity_id on tasks(activity_id);

create or replace view vw_pipeline_current as
select
  p.id,
  p.company_id,
  c.trade_name as company_name,
  coalesce(p.stage_code, 'potenciais_interessados') as stage_code,
  sc.label as stage_label,
  sc.stage_order,
  p.owner_name,
  p.next_action,
  p.next_action_due_at,
  p.follow_up_at,
  p.status,
  p.source,
  p.payload,
  p.created_at,
  p.updated_at
from pipeline p
left join companies c on c.id = p.company_id
left join pipeline_stage_catalog sc on sc.code = coalesce(p.stage_code, 'potenciais_interessados');
