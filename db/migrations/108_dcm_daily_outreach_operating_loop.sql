-- 108_dcm_daily_outreach_operating_loop.sql
-- Aplica a rotina diária de leads DCM, o Business Analyst Agent e o loop de aprendizado de escrita.
-- Esta migration é autossuficiente para ambientes que não receberam a migration histórica 020.

create extension if not exists pgcrypto;

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

create index if not exists idx_origination_os_artifacts_type
  on public.origination_os_artifacts (artifact_type);

create index if not exists idx_origination_os_artifacts_payload
  on public.origination_os_artifacts using gin (payload);

alter table public.origination_os_artifacts enable row level security;

drop policy if exists origination_os_artifacts_read_authenticated on public.origination_os_artifacts;
drop policy if exists origination_os_artifacts_write_service_role on public.origination_os_artifacts;

create policy origination_os_artifacts_read_authenticated
on public.origination_os_artifacts
for select
to authenticated
using (true);

create policy origination_os_artifacts_write_service_role
on public.origination_os_artifacts
for all
to service_role
using (true)
with check (true);

revoke all on table public.origination_os_artifacts from public, anon;
grant select on table public.origination_os_artifacts to authenticated;
grant select, insert, update, delete on table public.origination_os_artifacts to service_role;

create table if not exists public.dcm_daily_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_name text not null,
  contact_role text,
  linkedin_url text,
  product_hypothesis text not null,
  priority text not null default 'B',
  thesis text not null,
  generated_message text,
  actual_message text,
  outreach_status text not null default 'draft',
  recommended_skills jsonb not null default '[]'::jsonb,
  source_trace jsonb not null default '[]'::jsonb,
  next_action text,
  generated_on date not null default current_date,
  sent_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dcm_daily_leads_priority_check check (priority in ('A', 'B', 'C', 'Reciclar')),
  constraint dcm_daily_leads_status_check check (outreach_status in ('draft', 'ready', 'sent', 'repositioned', 'do_not_advance', 'missing_data')),
  constraint dcm_daily_leads_skills_array check (jsonb_typeof(recommended_skills) = 'array'),
  constraint dcm_daily_leads_source_trace_array check (jsonb_typeof(source_trace) = 'array')
);

create unique index if not exists uq_dcm_daily_leads_company_linkedin_day
  on public.dcm_daily_leads (company_id, lower(coalesce(linkedin_url, '')), generated_on)
  where company_id is not null and linkedin_url is not null;

create index if not exists idx_dcm_daily_leads_queue
  on public.dcm_daily_leads (generated_on desc, outreach_status, priority);

create index if not exists idx_dcm_daily_leads_company
  on public.dcm_daily_leads (company_id, created_at desc);

create table if not exists public.dcm_outreach_feedback (
  id uuid primary key default gen_random_uuid(),
  daily_lead_id uuid not null references public.dcm_daily_leads(id) on delete cascade,
  generated_message text not null,
  actual_message text not null,
  change_summary text,
  learned_rules jsonb not null default '[]'::jsonb,
  feedback_status text not null default 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dcm_outreach_feedback_status_check check (feedback_status in ('pending', 'reviewed', 'applied', 'rejected')),
  constraint dcm_outreach_feedback_rules_array check (jsonb_typeof(learned_rules) = 'array'),
  constraint dcm_outreach_feedback_messages_differ check (generated_message <> actual_message)
);

create index if not exists idx_dcm_outreach_feedback_status
  on public.dcm_outreach_feedback (feedback_status, created_at desc);

create or replace view public.dcm_daily_outreach_queue_v
with (security_invoker = true)
as
select
  lead.id,
  lead.generated_on,
  lead.company_id,
  company.trade_name as company_name,
  company.legal_name,
  lead.contact_name,
  lead.contact_role,
  lead.linkedin_url,
  lead.product_hypothesis,
  lead.priority,
  lead.thesis,
  lead.generated_message,
  lead.actual_message,
  lead.outreach_status,
  lead.recommended_skills,
  lead.source_trace,
  lead.next_action,
  lead.sent_at,
  lead.created_at,
  lead.updated_at,
  exists (
    select 1
    from public.dcm_outreach_feedback feedback
    where feedback.daily_lead_id = lead.id
      and feedback.feedback_status in ('pending', 'reviewed')
  ) as has_pending_feedback
from public.dcm_daily_leads lead
left join public.companies company on company.id = lead.company_id;

alter table public.dcm_daily_leads enable row level security;
alter table public.dcm_outreach_feedback enable row level security;

insert into public.origination_os_artifacts (id, artifact_type, title, description, payload, status, version)
values
  (
    'origination_business_analyst_v1',
    'agent_spec',
    'Business Analyst Agent',
    'Agente read-only para transformar demanda bruta em intake, riscos, open questions e handoff.',
    jsonb_build_object(
      'canonicalSpec', 'spec/platform/agents/business-analyst.md',
      'mode', 'read-only',
      'audience', 'business',
      'outputs', jsonb_build_array('intake', 'open questions', 'riscos', 'critérios de aceite', 'handoff')
    ),
    'active',
    '2026.07.24'
  ),
  (
    'origination_daily_dcm_workflow_v1',
    'workflow',
    'Rotina diária DCM',
    'Fluxo de novos leads, mensagens pendentes, briefing, pipeline, skills e feedback de escrita.',
    jsonb_build_object(
      'stages', jsonb_build_array('A. Novos leads', 'B. Leads sem mensagem', 'C. Briefing diário', 'D. Pipeline', 'E. Skills de venda', 'F. Aprendizado de escrita'),
      'tables', jsonb_build_array('dcm_daily_leads', 'dcm_outreach_feedback')
    ),
    'active',
    '2026.07.24'
  ),
  (
    'origination_outreach_guardrails_v1',
    'writing_profile',
    'Guardrails de abordagem DCM',
    'Regras de mensagem humana, concreta, sem promessas e com um produto hipótese.',
    jsonb_build_object(
      'rules', jsonb_build_array(
        'observação concreta',
        'um produto por mensagem',
        'sem promessa de taxa, prazo, volume ou aprovação',
        'cinco a seis linhas',
        'sem travessão',
        'CTA leve para conversa de vinte minutos'
      )
    ),
    'active',
    '2026.07.24'
  )
on conflict (id) do update set
  artifact_type = excluded.artifact_type,
  title = excluded.title,
  description = excluded.description,
  payload = excluded.payload,
  status = excluded.status,
  version = excluded.version,
  updated_at = now();

comment on table public.origination_os_artifacts is 'Contratos versionados do Origination Operating System.';
comment on table public.dcm_daily_leads is 'Fila diária auditável de leads e abordagens DCM.';
comment on table public.dcm_outreach_feedback is 'Comparação entre mensagem gerada e mensagem enviada para aprendizado de escrita.';
comment on view public.dcm_daily_outreach_queue_v is 'Visão operacional da fila diária DCM; executa com privilégios do usuário e respeita RLS.';
