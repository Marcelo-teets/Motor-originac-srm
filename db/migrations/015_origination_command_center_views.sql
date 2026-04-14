-- Migration 015 — Origination command center views
-- Objetivo: consolidar a leitura operacional do MVP 1.0
-- Pré-requisito: migrations 013 e 014 aplicadas

create or replace view latest_qualification_snapshot_v1 as
select distinct on (company_id)
  company_id,
  qualification_score_total,
  qualification_score_structural,
  qualification_score_capital,
  qualification_score_receivables,
  qualification_score_execution,
  qualification_score_timing,
  source_confidence_score,
  trigger_strength_score,
  suggested_structure_type,
  rationale_summary,
  confidence_score,
  created_at
from qualification_snapshots
order by company_id, created_at desc;

comment on view latest_qualification_snapshot_v1 is
  'Último snapshot de qualificação por empresa para leitura operacional do MVP.';

create or replace view latest_lead_score_snapshot_v1 as
select distinct on (company_id)
  company_id,
  lead_score,
  bucket,
  rationale,
  next_action,
  source_confidence,
  trigger_strength,
  pattern_score,
  created_at
from lead_score_snapshots
order by company_id, created_at desc;

comment on view latest_lead_score_snapshot_v1 is
  'Último lead score por empresa para leitura operacional do MVP.';

create or replace view latest_ranking_v2_v1 as
select distinct on (company_id)
  company_id,
  position,
  qualification_score,
  lead_score,
  ranking_score,
  rationale,
  created_at
from ranking_v2
order by company_id, created_at desc;

comment on view latest_ranking_v2_v1 is
  'Última posição de ranking por empresa.';

create or replace view latest_thesis_output_v1 as
select distinct on (company_id)
  company_id,
  thesis_summary,
  structure_type,
  market_map_summary,
  confidence_score,
  created_at
from thesis_outputs
order by company_id, created_at desc;

comment on view latest_thesis_output_v1 is
  'Última tese gerada por empresa.';

create or replace view latest_pipeline_row_v1 as
select distinct on (company_id)
  company_id,
  stage,
  owner,
  next_action,
  created_at,
  updated_at
from pipeline
order by company_id, updated_at desc nulls last, created_at desc;

comment on view latest_pipeline_row_v1 is
  'Último estado de pipeline por empresa.';

create or replace view latest_company_signal_v1 as
select distinct on (company_id)
  company_id,
  signal_type,
  signal_strength,
  confidence_score,
  evidence_payload,
  created_at
from company_signals
order by company_id, created_at desc;

comment on view latest_company_signal_v1 is
  'Último sinal observado por empresa.';

create or replace view origination_company_command_center_v1 as
with watchlist_counts as (
  select
    company_id,
    count(distinct watchlist_id) as watchlist_count,
    max(added_at) as last_watchlist_added_at
  from watchlist_items
  group by company_id
),
activity_stats as (
  select
    company_id,
    count(*) filter (where status = 'open') as open_activities,
    max(created_at) as last_activity_at
  from activities
  group by company_id
),
task_stats as (
  select
    company_id,
    count(*) filter (where status in ('todo', 'in_progress', 'blocked')) as open_tasks,
    max(updated_at) as last_task_at
  from tasks
  group by company_id
)
select
  c.id as company_id,
  coalesce(c.trade_name, c.legal_name) as company_name,
  c.legal_name,
  c.segment,
  c.subsegment,
  c.company_type,
  c.stage as company_stage,
  c.website,
  lq.qualification_score_total,
  ll.lead_score,
  ll.bucket as lead_bucket,
  lr.position as ranking_position,
  lr.ranking_score,
  coalesce(lt.structure_type, lq.suggested_structure_type) as suggested_structure,
  lp.stage as pipeline_stage,
  lp.owner as pipeline_owner,
  coalesce(lp.next_action, ll.next_action) as pipeline_next_action,
  lp.updated_at as pipeline_updated_at,
  coalesce(w.watchlist_count, 0) as watchlist_count,
  w.last_watchlist_added_at,
  coalesce(a.open_activities, 0) as open_activities,
  a.last_activity_at,
  coalesce(t.open_tasks, 0) as open_tasks,
  t.last_task_at,
  ls.signal_type as last_signal_type,
  ls.signal_strength as last_signal_strength,
  ls.confidence_score as last_signal_confidence,
  ls.created_at as last_signal_at,
  lt.thesis_summary,
  lt.market_map_summary,
  lq.rationale_summary as qualification_rationale,
  ll.rationale as lead_rationale,
  case
    when coalesce(w.watchlist_count, 0) > 0 and lp.stage is null then 'watchlist_only'
    when lp.stage is not null and lp.stage not in ('ClosedWon', 'ClosedLost') then 'pipeline_active'
    when lr.position is not null then 'ranking_only'
    else 'unclassified'
  end as commercial_state
from companies c
left join latest_qualification_snapshot_v1 lq on lq.company_id = c.id
left join latest_lead_score_snapshot_v1 ll on ll.company_id = c.id
left join latest_ranking_v2_v1 lr on lr.company_id = c.id
left join latest_thesis_output_v1 lt on lt.company_id = c.id
left join latest_pipeline_row_v1 lp on lp.company_id = c.id
left join latest_company_signal_v1 ls on ls.company_id = c.id
left join watchlist_counts w on w.company_id = c.id
left join activity_stats a on a.company_id = c.id
left join task_stats t on t.company_id = c.id;

comment on view origination_company_command_center_v1 is
  'Visão operacional consolidada do MVP: ranking, watch list, pipeline, tasks, activities, sinais e tese por empresa.';
