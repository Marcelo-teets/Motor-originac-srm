-- Neon-native Origination AI intro flow.
-- Field-level evidence -> Deal Master -> validation/readiness -> human-approved Intro.
-- Additive, idempotent and application-orchestrated. No pg_cron/vault/legacy auth writes.

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

-- Browser/Data API access is intentionally default-deny. The runtime accesses
-- these tables through the authenticated server-side Neon connection.
alter table public.company_evidence_facts enable row level security;
alter table public.company_ai_conflicts enable row level security;

comment on table public.company_evidence_facts is
  'Field-level evidence registry for the Origination -> Estruturacao AI flow. Canonical deal fields retain source lineage.';
comment on table public.company_ai_conflicts is
  'Material field-level conflicts in the Origination AI flow. Critical conflicts require human resolution before readiness.';
comment on column public.origination_os_artifacts.company_id is
  'Optional company scope for versioned Deal Master, readiness and Intro artifacts.';
