-- SRM Deal Card Intelligence v1 - Neon/Postgres
-- Additive only. Execute after reviewing with DB owner; no production change by this PR.
-- One company -> many opportunities -> many sources/evidence/versions.
-- Sensitive raw transcripts, email bodies, and client documents stay in original systems.

create table if not exists public.dcm_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null,
  product text not null default 'UNDEFINED'
    check (product in ('UNDEFINED','FIDC','CRI','CRA','DEBENTURE','DEBENTURE_INCENTIVADA')),
  stage text not null default 'potencial_interessado',
  status text not null default 'active'
    check (status in ('active','paused','recycled','declined','closed','cancelled')),
  revisit_of uuid references public.dcm_opportunities(id) on delete set null,
  owner_user_id text not null,
  financial_need text,
  target_amount numeric(20,2),
  currency text not null default 'BRL',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_amount is null or target_amount >= 0),
  unique (id, company_id)
);
create index if not exists dcm_opportunities_company on public.dcm_opportunities(company_id, updated_at desc);
create index if not exists dcm_opportunities_owner on public.dcm_opportunities(owner_user_id, status);

create table if not exists public.dcm_opportunity_members (
  opportunity_id uuid not null references public.dcm_opportunities(id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('owner','editor','viewer')),
  added_at timestamptz not null default now(),
  primary key (opportunity_id,user_id)
);
create index if not exists dcm_members_user on public.dcm_opportunity_members(user_id,opportunity_id);

create table if not exists public.dcm_originators (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  legal_name text,
  tax_id text,
  profile_type text,
  created_at timestamptz not null default now()
);
create unique index if not exists dcm_originators_tax_id on public.dcm_originators(tax_id) where tax_id is not null;

create table if not exists public.dcm_opportunity_originators (
  opportunity_id uuid not null references public.dcm_opportunities(id) on delete cascade,
  originator_id uuid not null references public.dcm_originators(id) on delete restrict,
  contribution_type text not null default 'introduction',
  attribution_note text,
  introduced_at timestamptz,
  linked_by text not null,
  created_at timestamptz not null default now(),
  primary key (opportunity_id,originator_id,contribution_type)
);
create index if not exists dcm_opportunity_originators_partner on public.dcm_opportunity_originators(originator_id);

create table if not exists public.dcm_source_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.dcm_opportunities(id) on delete cascade,
  provider text not null check (provider in (
    'fireflies','teams','outlook_email','outlook_calendar','sharepoint',
    'client_folder','crm','manual'
  )),
  external_id text not null,
  title text not null,
  source_ref text,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz,
  ingested_at timestamptz not null default now(),
  match_method text not null check (match_method in ('explicit','human_approved')),
  reviewed_by text,
  metadata jsonb not null default '{}'::jsonb,
  unique (opportunity_id, provider, external_id, content_sha256),
  unique (id, opportunity_id)
);
create index if not exists dcm_source_items_lookup on public.dcm_source_items(opportunity_id,occurred_at desc);
create index if not exists dcm_source_items_external on public.dcm_source_items(provider,external_id);

create table if not exists public.dcm_evidence_claims (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.dcm_opportunities(id) on delete cascade,
  source_id uuid not null,
  evidence_key text not null unique check (length(evidence_key) = 64),
  field_key text not null,
  reference_period text,
  value_json jsonb,
  claim_type text not null default 'unknown'
    check (claim_type in ('fact','analysis','hypothesis','unknown')),
  materiality text not null default 'medium'
    check (materiality in ('low','medium','high','critical')),
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'proposed'
    check (status in ('proposed','validated','disputed','superseded')),
  effective_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_id,opportunity_id)
    references public.dcm_source_items(id,opportunity_id) on delete restrict,
  check (status <> 'validated' or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists dcm_evidence_deal_field on public.dcm_evidence_claims(opportunity_id,field_key,reference_period,status);
create index if not exists dcm_evidence_review on public.dcm_evidence_claims(opportunity_id,status,materiality);

create table if not exists public.dcm_deal_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.dcm_opportunities(id) on delete cascade,
  type text not null check (type in ('meeting','decision','action','risk','stage_change','note')),
  title text not null,
  happened_at timestamptz not null,
  owner_user_id text,
  due_at timestamptz,
  state text check (state in ('open','done','blocked')),
  source_id uuid,
  recorded_by text not null,
  created_at timestamptz not null default now(),
  foreign key (source_id,opportunity_id)
    references public.dcm_source_items(id,opportunity_id) on delete restrict
);
create index if not exists dcm_deal_events_timeline on public.dcm_deal_events(opportunity_id,happened_at desc);
create index if not exists dcm_deal_events_actions on public.dcm_deal_events(opportunity_id,state,due_at)
  where type = 'action';

create table if not exists public.dcm_card_snapshots (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.dcm_opportunities(id) on delete cascade,
  version integer not null check (version > 0),
  schema_version text not null,
  payload jsonb not null,
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'draft' check (state in ('draft','in_review','approved','superseded')),
  generated_at timestamptz not null default now(),
  generated_by text not null,
  reviewed_at timestamptz,
  reviewed_by text,
  unique (opportunity_id,version),
  check (state <> 'approved' or (reviewed_by is not null and reviewed_at is not null))
);
create index if not exists dcm_card_latest on public.dcm_card_snapshots(opportunity_id,version desc);

-- Browser and Data API default-deny; application server must authenticate
-- and enforce opportunity_members for every read/write.
alter table public.dcm_opportunities enable row level security;
alter table public.dcm_opportunity_members enable row level security;
alter table public.dcm_originators enable row level security;
alter table public.dcm_opportunity_originators enable row level security;
alter table public.dcm_source_items enable row level security;
alter table public.dcm_evidence_claims enable row level security;
alter table public.dcm_deal_events enable row level security;
alter table public.dcm_card_snapshots enable row level security;

comment on table public.dcm_source_items is
  'Source reference/hash and match approval; never store raw emails, transcripts, or client documents.';
comment on table public.dcm_card_snapshots is
  'Immutable-version intent. Only a human-reviewed snapshot can be marked approved by application authorization.';
