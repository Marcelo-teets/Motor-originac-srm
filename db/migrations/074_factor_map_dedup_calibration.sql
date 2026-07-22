-- Repeated signals remain auditable observations, but are not independent factor contributions.
create or replace function public.refresh_company_factor_snapshots(p_company_id uuid,p_snapshot_date date default current_date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer:=0;
begin
  with eligible as (
    select observation.factor_id,observation.rule_id,observation.id,observation.signal_id,
      observation.observed_at,observation.confidence_score,observation.evidence_payload,
      coalesce(observation.evidence_payload->>'sourceCode','*') as source_code,
      observation.contribution*greatest(0.15,least(1.0,1.0-greatest(0,extract(epoch from (now()-observation.observed_at))/86400.0)/factor.decay_days)) as decayed_contribution
    from public.company_factor_observations observation
    join public.origination_factor_catalog factor on factor.id=observation.factor_id
    where observation.company_id=p_company_id and factor.active
      and (observation.expires_at is null or observation.expires_at>now())
  ), ranked as (
    select eligible.*,
      row_number() over(partition by eligible.factor_id,eligible.rule_id,eligible.source_code order by eligible.observed_at desc,abs(eligible.decayed_contribution) desc,eligible.id desc) as evidence_rank,
      count(*) over(partition by eligible.factor_id) as raw_evidence_count
    from eligible
  ), selected as (
    select * from ranked where evidence_rank=1
  ), aggregated as (
    select factor_id,least(100,sum(abs(decayed_contribution)))::numeric(8,4) as score,
      sum(decayed_contribution)::numeric(10,4) as net_contribution,
      count(*)::integer as evidence_count,max(raw_evidence_count)::integer as raw_evidence_count,
      count(distinct source_code)::integer as source_count,max(observed_at) as latest_observed_at,
      least(1,greatest(0,avg(confidence_score)))::numeric(8,6) as confidence_score
    from selected group by factor_id
  ), previous as (
    select distinct on(snapshot.factor_id) snapshot.factor_id,snapshot.score
    from public.company_factor_snapshots snapshot
    where snapshot.company_id=p_company_id and snapshot.snapshot_date<p_snapshot_date
    order by snapshot.factor_id,snapshot.snapshot_date desc
  )
  insert into public.company_factor_snapshots(
    company_id,factor_id,snapshot_date,score,net_contribution,trend,evidence_count,
    latest_observed_at,confidence_score,evidence_payload,created_at,updated_at
  )
  select p_company_id,aggregated.factor_id,p_snapshot_date,aggregated.score,aggregated.net_contribution,
    (aggregated.score-coalesce(previous.score,0))::numeric(10,4),aggregated.evidence_count,
    aggregated.latest_observed_at,aggregated.confidence_score,
    jsonb_build_object(
      'version','signal_factor_map_v1_1_deduplicated',
      'deduplicationKey','factor_id + rule_id + source_code',
      'selectedEvidenceCount',aggregated.evidence_count,
      'rawEvidenceCount',aggregated.raw_evidence_count,
      'sourceCount',aggregated.source_count,
      'observations',coalesce((select jsonb_agg(jsonb_build_object(
        'observationId',evidence.id,'signalId',evidence.signal_id,
        'observedAt',evidence.observed_at,'contribution',round(evidence.decayed_contribution,4),
        'confidence',evidence.confidence_score,'sourceCode',evidence.source_code,
        'evidence',evidence.evidence_payload
      ) order by abs(evidence.decayed_contribution) desc,evidence.observed_at desc)
      from selected evidence where evidence.factor_id=aggregated.factor_id),'[]'::jsonb)
    ),now(),now()
  from aggregated left join previous on previous.factor_id=aggregated.factor_id
  on conflict(company_id,factor_id,snapshot_date) do update set
    score=excluded.score,net_contribution=excluded.net_contribution,trend=excluded.trend,
    evidence_count=excluded.evidence_count,latest_observed_at=excluded.latest_observed_at,
    confidence_score=excluded.confidence_score,evidence_payload=excluded.evidence_payload,updated_at=now();
  get diagnostics affected=row_count;
  return affected;
end;
$$;
revoke all on function public.refresh_company_factor_snapshots(uuid,date) from public;
grant execute on function public.refresh_company_factor_snapshots(uuid,date) to service_role;

do $$
declare company_row record;
begin
  for company_row in select distinct company_id from public.company_factor_observations loop
    perform public.refresh_company_factor_snapshots(company_row.company_id,current_date);
  end loop;
end;
$$;
