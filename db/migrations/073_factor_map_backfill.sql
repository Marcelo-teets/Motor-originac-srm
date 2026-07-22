insert into public.company_factor_observations(
  company_id,signal_id,factor_id,rule_id,contribution,signal_strength,
  confidence_score,observed_at,expires_at,evidence_payload,created_at,updated_at
)
select signal.company_id,signal.id,rule.factor_id,rule.id,
  (rule.base_contribution*(least(100,greatest(0,coalesce(signal.signal_strength,signal.strength,0)))/100.0)*least(1,greatest(0,coalesce(signal.confidence_score,case when coalesce(signal.confidence,0)>1 then signal.confidence/100.0 else signal.confidence end,0))))::numeric(10,4),
  least(100,greatest(0,coalesce(signal.signal_strength,signal.strength,0))),
  least(1,greatest(0,coalesce(signal.confidence_score,case when coalesce(signal.confidence,0)>1 then signal.confidence/100.0 else signal.confidence end,0))),
  coalesce(signal.observed_at,signal.created_at,now()),
  coalesce(signal.observed_at,signal.created_at,now())+make_interval(days=>factor.decay_days),
  jsonb_build_object(
    'signalType',signal.signal_type,'signalLabel',signal.signal_label,
    'sourceCode',coalesce(signal.metadata->>'sourceCode',signal.evidence_payload->>'sourceCode','*'),
    'evidenceUrl',signal.evidence_url,'evidenceText',signal.evidence_text,
    'ruleVersion',rule.rule_version,'ruleRationale',rule.rationale,
    'signalEvidence',coalesce(signal.evidence_payload,'{}'::jsonb),'backfilled',true
  ),now(),now()
from public.company_signals signal
join public.source_factor_rules rule on rule.active and rule.signal_type=signal.signal_type
  and rule.source_code in ('*',coalesce(signal.metadata->>'sourceCode',signal.evidence_payload->>'sourceCode','*'))
join public.origination_factor_catalog factor on factor.id=rule.factor_id and factor.active
where least(100,greatest(0,coalesce(signal.signal_strength,signal.strength,0)))>=rule.min_strength
  and least(1,greatest(0,coalesce(signal.confidence_score,case when coalesce(signal.confidence,0)>1 then signal.confidence/100.0 else signal.confidence end,0)))>=rule.confidence_floor
on conflict(signal_id,factor_id,rule_id) do update set
  contribution=excluded.contribution,signal_strength=excluded.signal_strength,
  confidence_score=excluded.confidence_score,observed_at=excluded.observed_at,
  expires_at=excluded.expires_at,evidence_payload=excluded.evidence_payload,updated_at=now();

do $$
declare company_row record;
begin
  for company_row in select distinct company_id from public.company_factor_observations loop
    perform public.refresh_company_factor_snapshots(company_row.company_id,current_date);
  end loop;
end;
$$;
