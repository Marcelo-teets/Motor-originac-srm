-- Ranking V2 must never rebuild current snapshots from historical demo seeds.
-- Lead-score inserts are allowed only to trigger a ranking snapshot containing
-- companies explicitly approved by the governed credit review gate.

create or replace function public.refresh_ranking_v2()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_snapshot_at timestamptz:=clock_timestamp();
begin
  with latest_qualification as (
    select distinct on (qualification.company_id)
      qualification.company_id,
      qualification.qualification_score_total,
      qualification.trigger_strength_score,
      qualification.source_confidence_score,
      qualification.evidence_payload
    from public.qualification_snapshots qualification
    where qualification.qualification_score_total is not null
      and public.is_company_decision_eligible(qualification.company_id)
    order by qualification.company_id,qualification.created_at desc,qualification.id desc
  ), latest_lead as (
    select distinct on (lead.company_id)
      lead.company_id,
      lead.lead_score
    from public.lead_score_snapshots lead
    where lead.lead_score is not null
      and public.is_company_decision_eligible(lead.company_id)
    order by lead.company_id,lead.created_at desc,lead.id desc
  ), latest_pattern as (
    select distinct on (pattern.company_id,pattern.pattern_id)
      pattern.company_id,
      pattern.pattern_id,
      pattern.ranking_impact
    from public.company_patterns pattern
    where public.is_company_decision_eligible(pattern.company_id)
    order by pattern.company_id,pattern.pattern_id,pattern.detected_at desc,pattern.created_at desc,pattern.id desc
  ), pattern_impact as (
    select company_id,coalesce(sum(ranking_impact),0)::numeric ranking_impact
    from latest_pattern
    group by company_id
  ), scored as (
    select
      qualification.company_id,
      qualification.qualification_score_total::integer qualification_score,
      lead.lead_score::integer lead_score,
      greatest(0,least(100,round(
        qualification.qualification_score_total*0.40
        + lead.lead_score*0.35
        + coalesce(qualification.trigger_strength_score,0)*0.10
        + coalesce(qualification.source_confidence_score,0)*100*0.05
        + coalesce(pattern.ranking_impact,0)*0.10
        + coalesce((qualification.evidence_payload#>>'{publicEvidence,opportunityScore}')::numeric,0)*0.10
        - coalesce((qualification.evidence_payload#>>'{publicEvidence,riskPenalty}')::numeric,0)*0.28
      )))::integer raw_ranking_score,
      coalesce((qualification.evidence_payload#>>'{publicEvidence,blockingRiskCount}')::integer,0) blocking_risk_count,
      coalesce(qualification.evidence_payload#>>'{publicEvidence,riskLevel}','none') risk_level
    from latest_qualification qualification
    join latest_lead lead on lead.company_id=qualification.company_id
    left join pattern_impact pattern on pattern.company_id=qualification.company_id
  ), guarded as (
    select
      company_id,
      qualification_score,
      lead_score,
      case
        when blocking_risk_count>0 then least(raw_ranking_score,54)
        when risk_level='high' then least(raw_ranking_score,69)
        else raw_ranking_score
      end::integer ranking_score,
      risk_level
    from scored
  ), positioned as (
    select
      company_id,
      row_number() over(order by ranking_score desc,company_id asc)::integer position,
      qualification_score,
      lead_score,
      ranking_score,
      risk_level
    from guarded
  ), latest_snapshot as (
    select max(created_at) created_at from public.ranking_v2
  ), latest_rows as (
    select ranking.company_id,ranking.position,ranking.qualification_score,ranking.lead_score,ranking.ranking_score
    from public.ranking_v2 ranking
    join latest_snapshot snapshot on ranking.created_at=snapshot.created_at
  ), changes as (
    (select company_id,position,qualification_score,lead_score,ranking_score from positioned
     except
     select company_id,position,qualification_score,lead_score,ranking_score from latest_rows)
    union all
    (select company_id,position,qualification_score,lead_score,ranking_score from latest_rows
     except
     select company_id,position,qualification_score,lead_score,ranking_score from positioned)
  )
  insert into public.ranking_v2(
    company_id,position,qualification_score,lead_score,ranking_score,rationale,created_at
  )
  select
    company_id,
    position,
    qualification_score,
    lead_score,
    ranking_score,
    format('Ranking V2 com evidência pública, impactos de padrões, elegibilidade decisória e guardrail de risco (%s).',risk_level),
    v_snapshot_at
  from positioned
  where exists(select 1 from changes);
end;
$$;

comment on function public.refresh_ranking_v2() is
  'Materializa somente empresas explicitamente elegíveis após revisão de crédito; snapshots históricos sintéticos permanecem apenas para auditoria.';
