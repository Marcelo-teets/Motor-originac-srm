create or replace function public.refresh_company_factor_snapshots(p_company_id uuid,p_snapshot_date date default current_date)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer:=0;
begin
  with decayed as (
    select observation.factor_id,observation.id,observation.signal_id,observation.observed_at,
      observation.confidence_score,observation.evidence_payload,
      observation.contribution*greatest(0.15,least(1.0,1.0-greatest(0,extract(epoch from (now()-observation.observed_at))/86400.0)/factor.decay_days)) as decayed_contribution
    from public.company_factor_observations observation
    join public.origination_factor_catalog factor on factor.id=observation.factor_id
    where observation.company_id=p_company_id and factor.active
      and (observation.expires_at is null or observation.expires_at>now())
  ), aggregated as (
    select factor_id,least(100,sum(abs(decayed_contribution)))::numeric(8,4) as score,
      sum(decayed_contribution)::numeric(10,4) as net_contribution,count(*)::integer as evidence_count,
      max(observed_at) as latest_observed_at,
      least(1,greatest(0,avg(confidence_score)))::numeric(8,6) as confidence_score
    from decayed group by factor_id
  ), previous as (
    select distinct on (snapshot.factor_id) snapshot.factor_id,snapshot.score
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
    jsonb_build_object('version','signal_factor_map_v1','observations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'observationId',evidence.id,'signalId',evidence.signal_id,
        'observedAt',evidence.observed_at,'contribution',round(evidence.decayed_contribution,4),
        'confidence',evidence.confidence_score,'evidence',evidence.evidence_payload
      ) order by evidence.observed_at desc)
      from (select * from decayed item where item.factor_id=aggregated.factor_id order by item.observed_at desc limit 10) evidence
    ),'[]'::jsonb)),now(),now()
  from aggregated left join previous on previous.factor_id=aggregated.factor_id
  on conflict (company_id,factor_id,snapshot_date) do update set
    score=excluded.score,net_contribution=excluded.net_contribution,trend=excluded.trend,
    evidence_count=excluded.evidence_count,latest_observed_at=excluded.latest_observed_at,
    confidence_score=excluded.confidence_score,evidence_payload=excluded.evidence_payload,updated_at=now();
  get diagnostics affected=row_count;
  return affected;
end;
$$;
revoke all on function public.refresh_company_factor_snapshots(uuid,date) from public;
grant execute on function public.refresh_company_factor_snapshots(uuid,date) to service_role;

create or replace function public.capture_signal_factor_observations()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  source_code_value text;
  strength_value numeric;
  confidence_value numeric;
  observed_value timestamptz;
  rule_row public.source_factor_rules%rowtype;
begin
  source_code_value:=coalesce(new.metadata->>'sourceCode',new.evidence_payload->>'sourceCode',new.evidence_payload#>>'{normalized,sourceCode}','*');
  strength_value:=least(100,greatest(0,coalesce(new.signal_strength,new.strength,0)));
  confidence_value:=coalesce(new.confidence_score,case when coalesce(new.confidence,0)>1 then new.confidence/100.0 else new.confidence end,0);
  confidence_value:=least(1,greatest(0,confidence_value));
  observed_value:=coalesce(new.observed_at,new.created_at,now());

  for rule_row in
    select rule.* from public.source_factor_rules rule
    where rule.active and rule.signal_type=new.signal_type
      and rule.source_code in ('*',source_code_value)
      and strength_value>=rule.min_strength and confidence_value>=rule.confidence_floor
  loop
    insert into public.company_factor_observations(
      company_id,signal_id,factor_id,rule_id,contribution,signal_strength,confidence_score,
      observed_at,expires_at,evidence_payload,created_at,updated_at
    )
    select new.company_id,new.id,rule_row.factor_id,rule_row.id,
      (rule_row.base_contribution*(strength_value/100.0)*confidence_value)::numeric(10,4),
      strength_value,confidence_value,observed_value,
      observed_value+make_interval(days=>factor.decay_days),
      jsonb_build_object(
        'signalType',new.signal_type,'signalLabel',new.signal_label,
        'sourceCode',source_code_value,'evidenceUrl',new.evidence_url,
        'evidenceText',new.evidence_text,'ruleVersion',rule_row.rule_version,
        'ruleRationale',rule_row.rationale,'signalEvidence',coalesce(new.evidence_payload,'{}'::jsonb)
      ),now(),now()
    from public.origination_factor_catalog factor
    where factor.id=rule_row.factor_id and factor.active
    on conflict (signal_id,factor_id,rule_id) do update set
      contribution=excluded.contribution,signal_strength=excluded.signal_strength,
      confidence_score=excluded.confidence_score,observed_at=excluded.observed_at,
      expires_at=excluded.expires_at,evidence_payload=excluded.evidence_payload,updated_at=now();
  end loop;
  perform public.refresh_company_factor_snapshots(new.company_id,current_date);
  return new;
end;
$$;

create or replace function public.get_company_factor_map(p_company_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
with latest as (
  select distinct on (snapshot.factor_id) snapshot.factor_id,snapshot.score,snapshot.net_contribution,
    snapshot.trend,snapshot.evidence_count,snapshot.latest_observed_at,
    snapshot.confidence_score,snapshot.evidence_payload
  from public.company_factor_snapshots snapshot
  where snapshot.company_id=p_company_id
  order by snapshot.factor_id,snapshot.snapshot_date desc,snapshot.updated_at desc
), joined as (
  select factor.code,factor.name,factor.dimension,factor.hypothesis,factor.positive_direction,
    factor.default_weight,latest.score,latest.net_contribution,latest.trend,latest.evidence_count,
    latest.latest_observed_at,latest.confidence_score,latest.evidence_payload
  from latest join public.origination_factor_catalog factor on factor.id=latest.factor_id
  where factor.active
), metrics as (
  select count(*)::integer as factor_count,coalesce(sum(evidence_count),0)::integer as evidence_count,
    coalesce(sum(greatest(net_contribution,0)*default_weight) filter (where dimension='funding_need'),0)::numeric as funding_need_delta,
    coalesce(sum(greatest(net_contribution,0)*default_weight) filter (where dimension='fidc_fit'),0)::numeric as fidc_fit_delta,
    coalesce(sum(greatest(net_contribution,0)*default_weight) filter (where dimension='dcm_fit'),0)::numeric as dcm_fit_delta,
    coalesce(sum(greatest(net_contribution,0)*default_weight) filter (where dimension='timing'),0)::numeric as timing_delta,
    coalesce(sum(greatest(net_contribution,0)*default_weight) filter (where dimension='executability'),0)::numeric as execution_delta,
    coalesce(sum(abs(least(net_contribution,0))*default_weight) filter (where dimension='risk'),0)::numeric as risk_penalty,
    coalesce(avg(confidence_score),0)::numeric as avg_confidence,coalesce(max(score),0)::numeric as max_factor_score,
    coalesce(max(latest_observed_at),null) as latest_observed_at
  from joined
), top_factor as (select * from joined order by abs(net_contribution*default_weight) desc,score desc limit 1)
select jsonb_build_object(
  'version','signal_factor_map_v1','factorCount',metrics.factor_count,'evidenceCount',metrics.evidence_count,
  'fundingNeedDelta',round(least(40,metrics.funding_need_delta),4),
  'fidcFitDelta',round(least(35,metrics.fidc_fit_delta),4),
  'dcmFitDelta',round(least(35,metrics.dcm_fit_delta),4),
  'timingDelta',round(least(30,metrics.timing_delta),4),
  'executionDelta',round(least(25,metrics.execution_delta),4),
  'riskPenalty',round(least(45,metrics.risk_penalty),4),
  'opportunityScore',round(least(45,(metrics.funding_need_delta+metrics.fidc_fit_delta+metrics.dcm_fit_delta+metrics.timing_delta+metrics.execution_delta)/4.0),4),
  'sourceConfidence',round(least(1,greatest(0,metrics.avg_confidence)),4),
  'maxFactorScore',round(metrics.max_factor_score,4),'latestObservedAt',metrics.latest_observed_at,
  'topFactor',(select jsonb_build_object(
    'code',top_factor.code,'name',top_factor.name,'dimension',top_factor.dimension,
    'score',top_factor.score,'netContribution',top_factor.net_contribution,'trend',top_factor.trend,
    'hypothesis',top_factor.hypothesis,'latestObservedAt',top_factor.latest_observed_at) from top_factor),
  'factors',coalesce((select jsonb_agg(jsonb_build_object(
    'code',joined.code,'name',joined.name,'dimension',joined.dimension,'score',joined.score,
    'netContribution',joined.net_contribution,'trend',joined.trend,'evidenceCount',joined.evidence_count,
    'confidence',joined.confidence_score,'latestObservedAt',joined.latest_observed_at,
    'hypothesis',joined.hypothesis,'evidence',joined.evidence_payload
  ) order by abs(joined.net_contribution*joined.default_weight) desc,joined.score desc) from joined),'[]'::jsonb),
  'recommendedStructure',case
    when metrics.fidc_fit_delta>=8 and metrics.fidc_fit_delta>=metrics.dcm_fit_delta then 'FIDC / cessão de recebíveis condicionada à validação do ativo'
    when metrics.dcm_fit_delta>=8 then 'Debênture / nota comercial / reperfilamento de passivo'
    when metrics.funding_need_delta>=8 then 'Estrutura de capital a confirmar após diligência do funding gap'
    else null end,
  'nextAction',case
    when metrics.risk_penalty>=18 then 'Concluir diligência dos fatores de risco antes da abordagem comercial.'
    when metrics.fidc_fit_delta>=metrics.dcm_fit_delta and metrics.fidc_fit_delta>=8 then 'Validar carteira, recorrência, concentração, prazo e cessibilidade dos recebíveis.'
    when metrics.dcm_fit_delta>=8 then 'Mapear dívida, vencimentos, garantias, covenants e necessidade de alongamento.'
    when metrics.timing_delta>=8 then 'Confirmar o evento recente, sponsor financeiro e cronograma de capital.'
    when metrics.funding_need_delta>=8 then 'Dimensionar funding gap, uso dos recursos e estrutura atual de capital.'
    else 'Revisar os fatores e confirmar materialidade com o time de originação.' end
) from metrics;
$$;
grant execute on function public.get_company_factor_map(uuid) to authenticated,service_role;
