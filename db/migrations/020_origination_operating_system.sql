-- 020_origination_operating_system.sql
-- SRM Originação — Operating System de skills, fluxos, templates e backlog.

create table if not exists public.origination_os_artifacts (
  id text primary key,
  artifact_type text not null,
  title text not null,
  description text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  version text not null default '2026.05.28',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_origination_os_artifacts_type on public.origination_os_artifacts (artifact_type);
create index if not exists idx_origination_os_artifacts_payload on public.origination_os_artifacts using gin (payload);

alter table public.origination_os_artifacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'origination_os_artifacts'
      and policyname = 'origination_os_artifacts_read_authenticated'
  ) then
    create policy origination_os_artifacts_read_authenticated
      on public.origination_os_artifacts
      for select
      using (auth.role() in ('authenticated', 'service_role'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'origination_os_artifacts'
      and policyname = 'origination_os_artifacts_write_service_role'
  ) then
    create policy origination_os_artifacts_write_service_role
      on public.origination_os_artifacts
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

insert into public.origination_os_artifacts (id, artifact_type, title, description, payload, status, version)
values
  (
    'origination_os_scope_v1',
    'scope',
    'Escopo SRM Originação',
    'Produtos, estruturas SRM e tese central do Operating System de originação.',
    jsonb_build_object(
      'products', jsonb_build_array('FIDC', 'CRI', 'CRA', 'Debenture', 'Debenture Incentivada'),
      'structures', jsonb_build_array('SRM Ventures', 'SRM Empírica', 'SRM Asset', 'DCM SRM'),
      'thesis', 'Detectar sinais precoces de necessidade de funding e transformar inteligência em conversas qualificadas.'
    ),
    'active',
    '2026.05.28'
  ),
  (
    'origination_os_skills_v1',
    'skills',
    'Origination Skill Tree',
    'Árvore de skills para Research, geração de leads, ICP, perfil, hooks, materiais, sequenciamento e scoring.',
    jsonb_build_object(
      'skills', jsonb_build_array(
        'Research Skills',
        'Lead Generator',
        'ICP Decoder',
        'Profile Architect',
        'Hook Engineer',
        'Carousel / Deck Composer',
        'DM / Email Sequencer',
        'Lead Scorer'
      )
    ),
    'active',
    '2026.05.28'
  ),
  (
    'origination_os_scorecard_v1',
    'scorecard',
    'Scorecard DCM 0-100',
    'Critérios de priorização comercial para leads de DCM.',
    jsonb_build_object(
      'criteria', jsonb_build_array(
        jsonb_build_object('criterion', 'Aderência ao produto DCM', 'weight', 20),
        jsonb_build_object('criterion', 'Presença de recebíveis ou carteira', 'weight', 20),
        jsonb_build_object('criterion', 'Sinal de funding ou crescimento', 'weight', 15),
        jsonb_build_object('criterion', 'Tamanho mínimo da empresa', 'weight', 10),
        jsonb_build_object('criterion', 'Backing de VC/PE ou investidores relevantes', 'weight', 10),
        jsonb_build_object('criterion', 'Probabilidade de conversa executiva', 'weight', 10),
        jsonb_build_object('criterion', 'Clareza do produto SRM aplicável', 'weight', 10),
        jsonb_build_object('criterion', 'Urgência ou trigger recente', 'weight', 5)
      )
    ),
    'active',
    '2026.05.28'
  ),
  (
    'origination_os_backlog_v1',
    'backlog',
    'Backlog ORIG-001 a ORIG-020',
    'Backlog consolidado das pendências implementadas ou runtime-ready.',
    jsonb_build_object(
      'items', jsonb_build_array(
        'ORIG-001 Company Master',
        'ORIG-002 Template de lead enriquecido',
        'ORIG-003 Scorecard DCM 0-100',
        'ORIG-004 Abordagem LinkedIn',
        'ORIG-005 Pipeline SRM',
        'ORIG-006 Ranking semanal',
        'ORIG-007 Template de tese',
        'ORIG-008 Base de fontes públicas',
        'ORIG-009 Dashboard de originação',
        'ORIG-010 Triggers',
        'ORIG-011 One-pager',
        'ORIG-012 Sequência de e-mails',
        'ORIG-013 Hooks por produto',
        'ORIG-014 Reciclagem',
        'ORIG-015 Monitoramento VC/PE',
        'ORIG-016 Relatório setorial',
        'ORIG-017 Copiloto comercial',
        'ORIG-018 Bases externas',
        'ORIG-019 Histórico de score',
        'ORIG-020 Comparáveis'
      )
    ),
    'active',
    '2026.05.28'
  ),
  (
    'origination_os_templates_v1',
    'templates',
    'Templates operacionais de originação',
    'Templates de lead, tese, LinkedIn, follow-up, e-mail consultivo, one-pager e relatório mensal.',
    jsonb_build_object(
      'templates', jsonb_build_array('lead', 'thesis', 'linkedinInitial', 'followUpShort', 'emailConsultative', 'onePager', 'monthlySectorReport')
    ),
    'active',
    '2026.05.28'
  )
on conflict (id) do update set
  artifact_type = excluded.artifact_type,
  title = excluded.title,
  description = excluded.description,
  payload = excluded.payload,
  status = excluded.status,
  version = excluded.version,
  updated_at = now();
