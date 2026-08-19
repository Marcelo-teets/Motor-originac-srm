-- People & Capital decision views v2:
-- 1) use reported headcount growth on the first observation without pretending the derived prior was observed;
-- 2) expose role composition as HIRING INTENT, never as realized employee composition.

update public.source_catalog
set frequency='daily', updated_at=now()
where metadata->>'code'='src_tech_signals_latam';

create or replace view public.company_headcount_history_v1
with (security_invoker=true)
as
with ranked_daily as (
  select
    s.*,
    row_number() over (
      partition by s.company_id, date_trunc('day', s.observed_at)
      order by s.confidence_score desc, s.observed_at desc, s.created_at desc
    ) as confidence_rank
  from public.company_source_metric_snapshots s
  where s.metric_key='headcount_total'
    and s.observed_vs_inferred='observed'
    and s.metric_value is not null
), series as (
  select
    company_id,
    source_id,
    observed_at,
    period_start,
    metric_value::integer as headcount_total,
    confidence_score,
    raw_payload,
    lag(metric_value::integer) over (partition by company_id order by observed_at) as sequential_previous_headcount,
    lag(observed_at) over (partition by company_id order by observed_at) as sequential_previous_observed_at
  from ranked_daily
  where confidence_rank=1
), enriched as (
  select
    s.*,
    g.metric_value as reported_growth_pct,
    p.metric_value::integer as inferred_previous_headcount
  from series s
  left join lateral (
    select m.metric_value
    from public.company_source_metric_snapshots m
    where m.company_id=s.company_id
      and m.source_id=s.source_id
      and m.metric_key='headcount_growth_pct'
      and abs(extract(epoch from (m.observed_at-s.observed_at))) <= 5
    order by m.confidence_score desc, m.created_at desc
    limit 1
  ) g on true
  left join lateral (
    select m.metric_value
    from public.company_source_metric_snapshots m
    where m.company_id=s.company_id
      and m.source_id=s.source_id
      and m.metric_key='headcount_total_inferred_previous'
      and m.observed_vs_inferred='inferred'
      and abs(extract(epoch from (m.observed_at-s.observed_at))) <= 5
    order by m.confidence_score desc, m.created_at desc
    limit 1
  ) p on true
)
select
  company_id,
  source_id,
  observed_at,
  headcount_total,
  coalesce(sequential_previous_headcount, inferred_previous_headcount) as previous_headcount,
  case
    when sequential_previous_headcount is not null then headcount_total-sequential_previous_headcount
    when inferred_previous_headcount is not null then headcount_total-inferred_previous_headcount
    else null
  end as headcount_delta,
  case
    when sequential_previous_headcount > 0
      then round(((headcount_total-sequential_previous_headcount)::numeric/sequential_previous_headcount::numeric)*100,2)
    when reported_growth_pct is not null
      then round(reported_growth_pct::numeric,2)
    else null
  end as calculated_growth_pct,
  reported_growth_pct,
  inferred_previous_headcount,
  coalesce(sequential_previous_observed_at, period_start) as previous_observed_at,
  case
    when sequential_previous_headcount is not null then 'sequential_observations'
    when reported_growth_pct is not null and inferred_previous_headcount is not null then 'reported_growth_with_inferred_prior'
    when reported_growth_pct is not null then 'reported_growth_only'
    else 'single_observation'
  end as growth_basis,
  confidence_score,
  raw_payload
from enriched;

grant select on public.company_headcount_history_v1 to authenticated, service_role;

create or replace view public.company_people_capital_snapshot_v1
with (security_invoker=true)
as
with latest_headcount as (
  select distinct on (company_id)
    company_id,
    observed_at,
    headcount_total,
    previous_headcount,
    headcount_delta,
    calculated_growth_pct,
    reported_growth_pct,
    inferred_previous_headcount,
    growth_basis,
    confidence_score
  from public.company_headcount_history_v1
  order by company_id, observed_at desc
), jobs as (
  select
    company_id,
    count(*) filter (where status='open')::integer as open_jobs_total,
    count(*) filter (where status='open' and dcm_relevance_score >= 60)::integer as strategic_open_jobs,
    count(*) filter (where status='open' and role_family='capital_markets')::integer as capital_markets_open_jobs,
    count(*) filter (where status='open' and role_family in ('funding','treasury'))::integer as funding_treasury_open_jobs,
    count(*) filter (where status='open' and role_family in ('credit','risk','underwriting','collections'))::integer as credit_risk_open_jobs,
    count(*) filter (where first_seen_at >= now()-interval '30 days' and dcm_relevance_score >= 60)::integer as new_strategic_jobs_30d
  from public.company_job_openings
  group by company_id
), investors_agg as (
  select company_id, count(distinct investor_id)::integer as known_investors
  from public.company_investor_relationships
  group by company_id
)
select
  c.id as company_id,
  c.trade_name as company_name,
  h.observed_at as headcount_observed_at,
  h.headcount_total,
  h.previous_headcount,
  h.headcount_delta,
  h.calculated_growth_pct,
  h.reported_growth_pct,
  h.inferred_previous_headcount,
  h.growth_basis,
  coalesce(j.open_jobs_total,0) as open_jobs_total,
  coalesce(j.strategic_open_jobs,0) as strategic_open_jobs,
  coalesce(j.capital_markets_open_jobs,0) as capital_markets_open_jobs,
  coalesce(j.funding_treasury_open_jobs,0) as funding_treasury_open_jobs,
  coalesce(j.credit_risk_open_jobs,0) as credit_risk_open_jobs,
  coalesce(j.new_strategic_jobs_30d,0) as new_strategic_jobs_30d,
  case when coalesce(j.open_jobs_total,0)>0
    then round((coalesce(j.strategic_open_jobs,0)::numeric/j.open_jobs_total::numeric)*100,1)
    else 0 end as strategic_hiring_intent_pct,
  case when coalesce(j.open_jobs_total,0)>0
    then round((coalesce(j.capital_markets_open_jobs,0)::numeric/j.open_jobs_total::numeric)*100,1)
    else 0 end as capital_markets_hiring_intent_pct,
  case when coalesce(j.open_jobs_total,0)>0
    then round((coalesce(j.funding_treasury_open_jobs,0)::numeric/j.open_jobs_total::numeric)*100,1)
    else 0 end as funding_treasury_hiring_intent_pct,
  case when coalesce(j.open_jobs_total,0)>0
    then round((coalesce(j.credit_risk_open_jobs,0)::numeric/j.open_jobs_total::numeric)*100,1)
    else 0 end as credit_risk_hiring_intent_pct,
  coalesce(i.known_investors,0) as known_investors,
  least(100,
    case
      when h.calculated_growth_pct >= 20 then 35
      when h.calculated_growth_pct >= 10 then 25
      when h.calculated_growth_pct >= 5 then 15
      else 0
    end
    + case when coalesce(j.capital_markets_open_jobs,0)>0 then 30 else 0 end
    + case when coalesce(j.funding_treasury_open_jobs,0)>0 then 25 else 0 end
    + case when coalesce(j.credit_risk_open_jobs,0)>0 then 20 else 0 end
    + least(15,coalesce(j.new_strategic_jobs_30d,0)*5)
  )::integer as people_timing_score,
  concat_ws(' ',
    case
      when h.headcount_delta is not null and h.growth_basis='sequential_observations'
        then format('Headcount observado variou %s pessoas (%s%% calculado).',h.headcount_delta,coalesce(h.calculated_growth_pct,0))
      when h.reported_growth_pct is not null
        then format('Fonte reportou crescimento de headcount de %s%% para %s pessoas; base anterior %s.',h.reported_growth_pct,h.headcount_total,case when h.inferred_previous_headcount is not null then 'inferida' else 'não disponível' end)
      when h.headcount_total is not null
        then format('Headcount observado em %s pessoas, sem base anterior comparável.',h.headcount_total)
    end,
    case when coalesce(j.open_jobs_total,0)>0
      then format('%s/%s vagas abertas são estratégicas para crédito/risco/funding/DCM (%s%% de intenção de contratação).',j.strategic_open_jobs,j.open_jobs_total,round((j.strategic_open_jobs::numeric/j.open_jobs_total::numeric)*100,1)) end,
    case when coalesce(j.capital_markets_open_jobs,0)>0 then format('%s vagas diretamente em Capital Markets.',j.capital_markets_open_jobs) end,
    case when coalesce(i.known_investors,0)>0 then format('%s investidores relacionados no grafo.',i.known_investors) end
  ) as people_capital_rationale
from public.companies c
left join latest_headcount h on h.company_id=c.id
left join jobs j on j.company_id=c.id
left join investors_agg i on i.company_id=c.id;

grant select on public.company_people_capital_snapshot_v1 to authenticated, service_role;

comment on view public.company_people_capital_snapshot_v1 is
  'Decision view separating realized headcount change from open-role hiring intent; reported growth and inferred prior remain explicitly labeled.';
