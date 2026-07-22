create or replace view public.factor_outcome_map_v1
with (security_invoker=true)
as
with latest as (
  select distinct on (snapshot.company_id,snapshot.factor_id)
    snapshot.company_id,snapshot.factor_id,snapshot.score,snapshot.net_contribution,
    snapshot.confidence_score,snapshot.latest_observed_at
  from public.company_factor_snapshots snapshot
  order by snapshot.company_id,snapshot.factor_id,snapshot.snapshot_date desc,snapshot.updated_at desc
), labeled as (
  select latest.*,factor.code as factor_code,factor.name as factor_name,factor.dimension,
    pipeline.stage,pipeline.status,
    case
      when lower(coalesce(pipeline.stage,''))~'(mandated|closedwon|mandato assinado|estruturação|estruturacao|captação|captacao|fechado)' then 'positive'
      when lower(coalesce(pipeline.stage,''))~'(closedlost|não faz sentido|nao faz sentido)' or lower(coalesce(pipeline.status,'')) in ('lost','closed_lost') then 'negative'
      when pipeline.company_id is not null then 'active_pipeline'
      else 'unworked' end as outcome_label
  from latest
  join public.origination_factor_catalog factor on factor.id=latest.factor_id
  left join public.pipeline pipeline on pipeline.company_id=latest.company_id
)
select factor_code,factor_name,dimension,
  count(distinct company_id)::integer as companies_observed,
  count(distinct company_id) filter(where outcome_label='positive')::integer as positive_outcomes,
  count(distinct company_id) filter(where outcome_label='negative')::integer as negative_outcomes,
  count(distinct company_id) filter(where outcome_label='active_pipeline')::integer as active_pipeline,
  count(distinct company_id) filter(where outcome_label='unworked')::integer as unworked,
  round(avg(score),2) as average_factor_score,
  round(avg(net_contribution),2) as average_net_contribution,
  round(avg(confidence_score),4) as average_confidence,
  round(count(distinct company_id) filter(where outcome_label='positive')::numeric/nullif(count(distinct company_id) filter(where outcome_label in ('positive','negative')),0),4) as observed_positive_rate,
  max(latest_observed_at) as latest_evidence_at
from labeled
group by factor_code,factor_name,dimension;

grant select on public.factor_outcome_map_v1 to authenticated,service_role;
