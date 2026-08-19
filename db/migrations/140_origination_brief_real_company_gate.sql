-- Origination Brief v1 real-company gate.
-- Decision-oriented briefs must never materialize for mock/synthetic Company Master rows.

create or replace function public.is_company_origination_brief_eligible_v1(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id=p_company_id
      and coalesce(c.metadata->>'data_status','')='real'
      and coalesce(c.metadata->>'synthetic_seed','false')='false'
  );
$$;

revoke all on function public.is_company_origination_brief_eligible_v1(uuid) from public;
grant execute on function public.is_company_origination_brief_eligible_v1(uuid) to service_role;

create or replace function public.guard_people_capital_hiring_signal_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_evidence text;
begin
  if new.signal_type='origination_brief'
     and not public.is_company_origination_brief_eligible_v1(new.company_id) then
    return null;
  end if;

  v_evidence := coalesce(
    new.evidence_payload->>'note',
    new.evidence_payload->>'summary',
    new.evidence_payload->>'evidenceText',
    new.evidence_text,
    ''
  );

  if not public.is_trusted_hiring_signal_evidence_v1(new.signal_type, v_evidence) then
    return null;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_company_origination_brief_v1(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.company_origination_brief_v1%rowtype;
  v_note text;
begin
  if p_company_id is null then return; end if;

  -- Always clear a stale derived brief first. This also cleans historical mock materializations.
  delete from public.company_signals
  where company_id=p_company_id
    and signal_type='origination_brief';

  -- Real/non-synthetic Company Master rows may receive a review brief even when the stricter
  -- Lead Score decision gate is still closed. Mock/demo rows never receive this artifact.
  if not public.is_company_origination_brief_eligible_v1(p_company_id) then
    return;
  end if;

  select * into b
  from public.company_origination_brief_v1
  where company_id=p_company_id;

  if b.company_id is null then return; end if;

  v_note := concat_ws(' ',
    nullif(b.why_now,''),
    format('Padrão provável: %s.', b.probable_pattern),
    format('Estrutura sugerida: %s.', b.suggested_structure),
    format('Ângulo comercial: %s', b.commercial_angle),
    format('Próxima ação: %s', b.next_action)
  );

  insert into public.company_signals (
    company_id, signal_type, signal_label, strength, confidence, is_explicit,
    evidence_text, observed_at, metadata, source_id, signal_strength,
    confidence_score, evidence_payload, observed_vs_inferred, created_at, updated_at
  ) values (
    p_company_id,
    'origination_brief',
    'Origination Intelligence Brief',
    b.origination_conviction_score,
    round(b.brief_confidence * 100,2),
    false,
    v_note,
    now(),
    jsonb_build_object('version','v1','derived',true,'decisionArtifact',true),
    null,
    b.origination_conviction_score,
    b.brief_confidence,
    jsonb_build_object(
      'version','v1',
      'note',v_note,
      'whyCredit',b.why_credit,
      'whyNow',b.why_now,
      'probablePattern',b.probable_pattern,
      'suggestedStructure',b.suggested_structure,
      'commercialAngle',b.commercial_angle,
      'nextAction',b.next_action,
      'originationConvictionScore',b.origination_conviction_score,
      'briefConfidence',b.brief_confidence,
      'peopleCapital',jsonb_build_object(
        'headcountTotal',b.headcount_total,
        'headcountDelta',b.headcount_delta,
        'growthPct',b.calculated_growth_pct,
        'growthBasis',b.growth_basis,
        'openJobs',b.open_jobs_total,
        'strategicJobs',b.strategic_open_jobs,
        'strategicHiringIntentPct',b.strategic_hiring_intent_pct,
        'capitalMarketsJobs',b.capital_markets_open_jobs,
        'fundingTreasuryJobs',b.funding_treasury_open_jobs,
        'creditRiskJobs',b.credit_risk_open_jobs,
        'knownInvestors',b.investor_count,
        'peopleTimingScore',b.people_timing_score
      )
    ),
    'recommended',
    now(),
    now()
  );

  -- Preserve any human-authored commercial action. Only machine placeholders can be replaced.
  update public.pipeline p
  set next_action=b.next_action,
      expected_structure=coalesce(nullif(p.expected_structure,''),b.suggested_structure),
      updated_at=now()
  where p.company_id=p_company_id
    and (
      p.next_action is null
      or btrim(p.next_action)=''
      or lower(btrim(p.next_action)) in (
        'executar análise comercial',
        'executar analise comercial',
        'definir próximo passo comercial',
        'definir proximo passo comercial'
      )
    );
end;
$$;

-- Re-materialize all rows so stale mock briefs are removed immediately.
do $$
declare
  r record;
begin
  for r in select id from public.companies loop
    perform public.refresh_company_origination_brief_v1(r.id);
  end loop;
end;
$$;
