-- Source treatment impact views.
-- Purpose: make non-obvious source impacts auditable before/while they feed qualification, patterns and ranking.
-- Depends on 029_non_obvious_sources_capture_treatment.sql.

create or replace view public.company_signal_treatment_impact_v as
select
  cs.company_id,
  cs.id as signal_id,
  cs.source_id,
  sc.name as source_name,
  cs.signal_type,
  cs.signal_strength,
  cs.confidence_score,
  coalesce(cs.evidence_payload->>'sourceCode', sc.metadata->>'code', cs.source_id) as source_code,
  cs.evidence_payload->>'sourceUrl' as evidence_url,
  cs.evidence_payload->>'note' as evidence_note,
  str.signal_family,
  str.strength_floor,
  str.confidence_delta,
  str.structural_score_delta,
  str.timing_score_delta,
  str.executability_score_delta,
  str.pattern_tags,
  str.treatment_policy,
  case when cs.signal_strength >= str.strength_floor then true else false end as passes_strength_floor,
  case when cs.signal_strength >= str.strength_floor then str.structural_score_delta else 0 end as applied_structural_delta,
  case when cs.signal_strength >= str.strength_floor then str.timing_score_delta else 0 end as applied_timing_delta,
  case when cs.signal_strength >= str.strength_floor then str.executability_score_delta else 0 end as applied_executability_delta,
  cs.created_at
from public.company_signals cs
left join public.source_catalog sc
  on sc.id = cs.source_id
join public.source_treatment_rules str
  on str.signal_type = cs.signal_type
 and str.source_code = coalesce(cs.evidence_payload->>'sourceCode', sc.metadata->>'code', cs.source_id);

create or replace view public.company_treatment_score_impact_v as
with base as (
  select
    company_id,
    count(*) as treated_signals_count,
    count(*) filter (where passes_strength_floor) as actionable_signals_count,
    greatest(-15, least(22, coalesce(sum(applied_structural_delta), 0)))::integer as structural_score_delta,
    greatest(-10, least(24, coalesce(sum(applied_timing_delta), 0)))::integer as timing_score_delta,
    greatest(-25, least(16, coalesce(sum(applied_executability_delta), 0)))::integer as executability_score_delta,
    max(signal_strength) as max_signal_strength,
    round(avg(confidence_score)::numeric, 2) as avg_confidence_score,
    array_agg(distinct signal_type) as signal_types,
    array_agg(distinct signal_family) as signal_families,
    max(created_at) as last_treated_signal_at
  from public.company_signal_treatment_impact_v
  group by company_id
), tags as (
  select
    company_id,
    array_agg(distinct tag order by tag) as pattern_tags
  from public.company_signal_treatment_impact_v
  cross join lateral unnest(pattern_tags) as tag
  group by company_id
), next_actions as (
  select
    company_id,
    array_agg(distinct treatment_policy->>'next_action') filter (where treatment_policy ? 'next_action') as next_actions
  from public.company_signal_treatment_impact_v
  where passes_strength_floor
  group by company_id
)
select
  base.company_id,
  base.treated_signals_count,
  base.actionable_signals_count,
  base.structural_score_delta,
  base.timing_score_delta,
  base.executability_score_delta,
  base.structural_score_delta + base.timing_score_delta + base.executability_score_delta as total_treatment_delta,
  base.max_signal_strength,
  base.avg_confidence_score,
  base.signal_types,
  base.signal_families,
  coalesce(tags.pattern_tags, array[]::text[]) as pattern_tags,
  coalesce(next_actions.next_actions, array[]::text[]) as next_actions,
  base.last_treated_signal_at
from base
left join tags using (company_id)
left join next_actions using (company_id);

create or replace view public.company_treatment_source_breakdown_v as
select
  company_id,
  source_code,
  source_name,
  signal_type,
  signal_family,
  count(*) as signal_count,
  count(*) filter (where passes_strength_floor) as actionable_signal_count,
  max(signal_strength) as max_signal_strength,
  round(avg(confidence_score)::numeric, 2) as avg_confidence_score,
  sum(applied_structural_delta)::integer as structural_score_delta,
  sum(applied_timing_delta)::integer as timing_score_delta,
  sum(applied_executability_delta)::integer as executability_score_delta,
  max(created_at) as last_signal_at
from public.company_signal_treatment_impact_v
group by company_id, source_code, source_name, signal_type, signal_family;

comment on view public.company_signal_treatment_impact_v is 'Signal-level impact from non-obvious source treatment rules.';
comment on view public.company_treatment_score_impact_v is 'Company-level aggregate score impact from treated non-obvious source signals.';
comment on view public.company_treatment_source_breakdown_v is 'Company/source/signal breakdown for auditing treated source impact.';
