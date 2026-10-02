-- 20260915140000_ai_intro_agents_mvp.sql
-- SRM Originação — field-level evidence, conflicts and company-scoped AI artifacts.
-- Additive foundation for the Originação -> Estruturação intro-agent flow.
-- No lifecycle triggers: orchestration stays in the application layer.

alter table public.origination_os_artifacts
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists generated_by text;

create index if not exists idx_origination_os_artifacts_company_type
  on public.origination_os_artifacts (company_id, artifact_type, updated_at desc)
  where company_id is not null;

create table if not exists public.company_evidence_facts (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null unique,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_kind text not null,
  source_record_id text,
  source_ref text,
  field_key text not null,
  classification text not null default 'unknown'
    check (classification in ('fact','analysis','hypothesis','unknown')),
  value_json jsonb,
  source_excerpt text,
  confidence numeric not null default 0.5
    check (confidence >= 0 and confidence <= 1),
  materiality text not null default 'medium'
    check (materiality in ('low','medium','high','critical')),
  effective_at timestamptz,
  status text not null default 'active'
    check (status in ('active','superseded','disputed','validated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_evidence_facts_company_field
  on public.company_evidence_facts (company_id, field_key, effective_at desc, created_at desc);
create index if not exists idx_company_evidence_facts_company_status
  on public.company_evidence_facts (company_id, status, created_at desc);
create index if not exists idx_company_evidence_facts_source
  on public.company_evidence_facts (source_kind, source_record_id);
create index if not exists idx_company_evidence_facts_metadata
  on public.company_evidence_facts using gin (metadata);

create table if not exists public.company_ai_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_key text not null,
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  conflict_type text not null,
  evidence_ids uuid[] not null default '{}'::uuid[],
  description text not null,
  recommended_resolution text,
  human_question text,
  status text not null default 'open'
    check (status in ('open','resolved','dismissed')),
  human_review_required boolean not null default false,
  selected_evidence_id uuid references public.company_evidence_facts(id) on delete set null,
  resolved_by text,
  resolution_note text,
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_ai_conflicts_company_status
  on public.company_ai_conflicts (company_id, status, severity, created_at desc);
create index if not exists idx_company_ai_conflicts_field
  on public.company_ai_conflicts (company_id, field_key, conflict_type);
create unique index if not exists uq_company_ai_conflicts_open
  on public.company_ai_conflicts (company_id, field_key, conflict_type)
  where status = 'open';

alter table public.company_evidence_facts enable row level security;
alter table public.company_ai_conflicts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='company_evidence_facts'
      and policyname='company_evidence_facts_read_authenticated'
  ) then
    create policy company_evidence_facts_read_authenticated
      on public.company_evidence_facts for select
      using (auth.role() in ('authenticated','service_role'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='company_evidence_facts'
      and policyname='company_evidence_facts_write_service_role'
  ) then
    create policy company_evidence_facts_write_service_role
      on public.company_evidence_facts for all
      using (auth.role()='service_role')
      with check (auth.role()='service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='company_ai_conflicts'
      and policyname='company_ai_conflicts_read_authenticated'
  ) then
    create policy company_ai_conflicts_read_authenticated
      on public.company_ai_conflicts for select
      using (auth.role() in ('authenticated','service_role'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='company_ai_conflicts'
      and policyname='company_ai_conflicts_write_service_role'
  ) then
    create policy company_ai_conflicts_write_service_role
      on public.company_ai_conflicts for all
      using (auth.role()='service_role')
      with check (auth.role()='service_role');
  end if;
end $$;

comment on table public.company_evidence_facts is
  'Field-level evidence registry for the SRM Originação AI intro flow. Every canonical deal field must retain source lineage.';
comment on table public.company_ai_conflicts is
  'Material field-level conflicts detected by the AI intro flow. Critical conflicts require human review before readiness.';
comment on column public.origination_os_artifacts.company_id is
  'Optional company scope for versioned Deal Master, readiness and Intro artifacts.';
