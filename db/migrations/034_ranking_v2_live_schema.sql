-- Ranking V2 live schema compatibility
--
-- Production already has the legacy public.ranking table, but the Ranking V2
-- persistence function introduced in migration 033 writes to public.ranking_v2.
-- This additive migration creates the missing audit table and then recreates the
-- function/trigger so GitHub and the live Supabase schema remain aligned.

create extension if not exists pgcrypto;

create table if not exists public.ranking_v2 (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  position integer not null check (position > 0),
  qualification_score integer not null check (qualification_score between 0 and 100),
  lead_score integer not null check (lead_score between 0 and 100),
  ranking_score integer not null check (ranking_score between 0 and 100),
  rationale text not null,
  created_at timestamptz not null default now()
);

alter table public.ranking_v2 enable row level security;

comment on table public.ranking_v2 is
  'Snapshots integrais e auditáveis do Ranking V2. Acesso operacional ocorre pelo backend com credencial de serviço.';

create index if not exists idx_ranking_v2_snapshot_company
  on public.ranking_v2 (created_at desc, company_id, position);

create index if not exists idx_ranking_v2_company_history
  on public.ranking_v2 (company_id, created_at desc);

create or replace function public.refresh_ranking_v2()
returns void
language plpgsql
set search_path = public
as $$
declare
  v_snapshot_at timestamptz := clock_timestamp();
begin
  with latest_qualification as (
    select distinct on (company_id)
      company_id,
      qualification_score_total,
      trigger_strength_score,
      source_confidence_score
    from public.qualification_snapshots
    where qualification_score_total is not null
    order by company_id, created_at desc, id desc
  ),
  latest_lead as (
    select distinct on (company_id)
      company_id,
      lead_score
    from public.lead_score_snapshots
    where lead_score is not null
    order by company_id, created_at desc, id desc
  ),
  pattern_impact as (
    select
      company_id,
      coalesce(sum(ranking_impact), 0)::numeric as ranking_impact
    from public.company_patterns
    group by company_id
  ),
  scored as (
    select
      qualification.company_id,
      qualification.qualification_score_total::integer as qualification_score,
      lead.lead_score::integer as lead_score,
      greatest(
        0,
        least(
          100,
          round(
            qualification.qualification_score_total * 0.40
            + lead.lead_score * 0.35
            + coalesce(qualification.trigger_strength_score, 0) * 0.10
            + coalesce(qualification.source_confidence_score, 0) * 100 * 0.05
            + coalesce(pattern.ranking_impact, 0) * 0.10
          )
        )
      )::integer as ranking_score
    from latest_qualification qualification
    inner join latest_lead lead
      on lead.company_id = qualification.company_id
    left join pattern_impact pattern
      on pattern.company_id = qualification.company_id
  ),
  positioned as (
    select
      company_id,
      row_number() over (order by ranking_score desc, company_id asc)::integer as position,
      qualification_score,
      lead_score,
      ranking_score
    from scored
  ),
  latest_snapshot as (
    select max(created_at) as created_at
    from public.ranking_v2
  ),
  latest_rows as (
    select
      ranking.company_id,
      ranking.position,
      ranking.qualification_score,
      ranking.lead_score,
      ranking.ranking_score
    from public.ranking_v2 ranking
    inner join latest_snapshot snapshot
      on ranking.created_at = snapshot.created_at
  ),
  changes as (
    (
      select company_id, position, qualification_score, lead_score, ranking_score
      from positioned
      except
      select company_id, position, qualification_score, lead_score, ranking_score
      from latest_rows
    )
    union all
    (
      select company_id, position, qualification_score, lead_score, ranking_score
      from latest_rows
      except
      select company_id, position, qualification_score, lead_score, ranking_score
      from positioned
    )
  )
  insert into public.ranking_v2 (
    company_id,
    position,
    qualification_score,
    lead_score,
    ranking_score,
    rationale,
    created_at
  )
  select
    company_id,
    position,
    qualification_score,
    lead_score,
    ranking_score,
    'Ranking V2 pondera qualification, lead score, impactos de padrões, força de gatilho e confiança de fonte.',
    v_snapshot_at
  from positioned
  where exists (select 1 from changes);
end;
$$;

comment on function public.refresh_ranking_v2() is
  'Reconstroi e persiste um snapshot integral do Ranking V2 quando os componentes de ranking mudam.';

create or replace function public.trg_refresh_ranking_v2_after_lead_score_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_ranking_v2();
  return null;
end;
$$;

drop trigger if exists refresh_ranking_v2_after_lead_score_insert on public.lead_score_snapshots;

create trigger refresh_ranking_v2_after_lead_score_insert
after insert on public.lead_score_snapshots
for each statement
execute function public.trg_refresh_ranking_v2_after_lead_score_insert();
