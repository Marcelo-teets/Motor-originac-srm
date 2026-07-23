create or replace view public.factor_outcome_observations_v2
with (security_invoker = true)
as
with latest as (
  select distinct on (snapshot.company_id, snapshot.factor_id)
    snapshot.company_id,
    snapshot.factor_id,
    snapshot.score,
    snapshot.net_contribution,
    snapshot.confidence_score,
    snapshot.latest_observed_at
  from public.company_factor_snapshots snapshot
  order by snapshot.company_id, snapshot.factor_id, snapshot.snapshot_date desc, snapshot.updated_at desc, snapshot.id desc
)
select
  latest.company_id,
  coalesce(c.trade_name, c.legal_name) as company_name,
  factor.code as factor_code,
  factor.name as factor_name,
  factor.dimension,
  latest.score,
  latest.net_contribution,
  latest.confidence_score,
  latest.latest_observed_at,
  p.stage as pipeline_stage,
  p.status as pipeline_status,
  case
    when p.stage in ('Mandated', 'ClosedWon') then 'positive'
    when p.stage = 'ClosedLost' or lower(coalesce(p.status, '')) in ('lost', 'closed_lost') then 'negative'
    when p.company_id is not null then 'active_pipeline'
    else 'unworked'
  end as outcome_label
from latest
join public.origination_factor_catalog factor on factor.id = latest.factor_id
join public.companies c on c.id = latest.company_id
left join public.pipeline p on p.company_id = latest.company_id;

create or replace view public.factor_outcome_map_v2
with (security_invoker = true)
as
select
  factor_code,
  factor_name,
  dimension,
  count(distinct company_id)::integer as companies_observed,
  count(distinct company_id) filter (where outcome_label = 'positive')::integer as positive_outcomes,
  count(distinct company_id) filter (where outcome_label = 'negative')::integer as negative_outcomes,
  count(distinct company_id) filter (where outcome_label = 'active_pipeline')::integer as active_pipeline,
  count(distinct company_id) filter (where outcome_label = 'unworked')::integer as unworked,
  round(avg(score), 2) as average_factor_score,
  round(avg(net_contribution), 2) as average_net_contribution,
  round(avg(confidence_score), 4) as average_confidence,
  round(
    count(distinct company_id) filter (where outcome_label = 'positive')::numeric
    / nullif(count(distinct company_id) filter (where outcome_label in ('positive', 'negative')), 0),
    4
  ) as observed_positive_rate,
  case
    when count(distinct company_id) filter (where outcome_label in ('positive', 'negative')) >= 20 then 'stronger'
    when count(distinct company_id) filter (where outcome_label in ('positive', 'negative')) >= 5 then 'directional'
    else 'insufficient'
  end as sample_quality,
  max(latest_observed_at) as latest_evidence_at
from public.factor_outcome_observations_v2
group by factor_code, factor_name, dimension;

comment on view public.factor_outcome_map_v2
is 'Conservative factor-to-pipeline outcome association map. Structuring remains active pipeline; only Mandated/ClosedWon are positive.';

revoke all on public.factor_outcome_observations_v2 from public, anon;
revoke all on public.factor_outcome_map_v2 from public, anon;
grant select on public.factor_outcome_observations_v2 to authenticated, service_role;
grant select on public.factor_outcome_map_v2 to authenticated, service_role;
