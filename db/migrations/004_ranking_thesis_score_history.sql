-- Migration: persist ranking, thesis and score history for MVP.

create extension if not exists pgcrypto;

alter table ranking_v2
  add column if not exists qualification_score_delta integer,
  add column if not exists lead_score_delta integer,
  add column if not exists trigger_strength integer,
  add column if not exists source_confidence numeric(5,2),
  add column if not exists suggested_structure text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists uq_ranking_v2_company_latest on ranking_v2(company_id, created_at);
create index if not exists idx_ranking_v2_position on ranking_v2(position, created_at desc);
create index if not exists idx_ranking_v2_company on ranking_v2(company_id, created_at desc);

alter table thesis_outputs
  add column if not exists why_now text,
  add column if not exists commercial_angle text,
  add column if not exists validation_risks jsonb not null default '[]'::jsonb,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_thesis_outputs_company on thesis_outputs(company_id, created_at desc);

alter table score_history
  add column if not exists rationale text,
  add column if not exists source_confidence numeric(5,2),
  add column if not exists trigger_strength integer,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists idx_score_history_company_type on score_history(company_id, score_type, created_at desc);

create or replace view vw_latest_ranking_v2 as
with ranked as (
  select
    r.*, 
    row_number() over (partition by r.company_id order by r.created_at desc, r.position asc) as rn
  from ranking_v2 r
)
select
  id,
  company_id,
  position,
  qualification_score,
  lead_score,
  ranking_score,
  qualification_score_delta,
  lead_score_delta,
  trigger_strength,
  source_confidence,
  suggested_structure,
  rationale,
  created_at,
  updated_at
from ranked
where rn = 1;

create or replace view vw_latest_thesis_outputs as
with ranked as (
  select
    t.*, 
    row_number() over (partition by t.company_id order by t.created_at desc) as rn
  from thesis_outputs t
)
select
  id,
  company_id,
  thesis_summary,
  structure_type,
  market_map_summary,
  why_now,
  commercial_angle,
  validation_risks,
  evidence_payload,
  confidence_score,
  created_at,
  updated_at
from ranked
where rn = 1;
