-- Origination Intelligence Brief v1
-- Closes People & Capital -> signals -> qualification/patterns -> commercial execution.
-- Observed facts remain observed; the brief is an analytical/recommended artifact.

create or replace function public.is_trusted_hiring_signal_evidence_v1(
  p_signal_type text,
  p_evidence text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when p_signal_type not in (
      'credit_team_hiring',
      'capital_markets_hiring',
      'funding_team_hiring',
      'credit_infrastructure_buildout'
    ) then true
    else lower(coalesce(p_evidence,'')) ~
      '(vaga(s)?( aberta(s)?| estratégica(s)?| para )|job posting|job opening|open position|career(s)?|carreira(s)?|trabalhe conosco|role opening)'
  end;
$$;

comment on function public.is_trusted_hiring_signal_evidence_v1(text,text) is
  'Rejects editorial keyword false positives from hiring signal types; requires explicit vacancy/careers evidence.';

create or replace function public.guard_people_capital_hiring_signal_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_evidence text;
begin
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

revoke all on function public.guard_people_capital_hiring_signal_v1() from public;

drop trigger if exists trg_guard_people_capital_hiring_signal_v1 on public.company_signals;
create trigger trg_guard_people_capital_hiring_signal_v1
before insert or update on public.company_signals
for each row
execute function public.guard_people_capital_hiring_signal_v1();

-- Remove only wrong DERIVED hiring classifications. Raw monitoring evidence remains untouched.
delete from public.company_signals s
where s.signal_type in (
    'credit_team_hiring',
    'capital_markets_hiring',
    'funding_team_hiring',
    'credit_infrastructure_buildout'
  )
  and not public.is_trusted_hiring_signal_evidence_v1(
    s.signal_type,
    coalesce(
      s.evidence_payload->>'note',
      s.evidence_payload->>'summary',
      s.evidence_payload->>'evidenceText',
      s.evidence_text,
      ''
    )
  );

create or replace view public.company_origination_brief_v1
with (security_invoker=true)
as
with latest_q as (
  select distinct on (q.company_id) q.*
  from public.qualification_snapshots q
  order by q.company_id, q.created_at desc, q.id desc
), signal_base as (
  select
    s.company_id,
    s.signal_type,
    coalesce(s.signal_strength, s.strength, 0)::numeric as signal_strength,
    case
      when coalesce(s.confidence_score, 0) between 0 and 1 and coalesce(s.confidence_score,0) > 0
        then s.confidence_score
      else coalesce(s.confidence, 0) / 100.0
    end::numeric as signal_confidence,
    coalesce(
      s.evidence_payload->>'note',
      s.evidence_payload->>'summary',
      s.evidence_payload->>'evidenceText',
      s.evidence_text,
      ''
    ) as evidence,
    s.created_at
  from public.company_signals s
  where s.signal_type <> 'origination_brief'
    and s.created_at >= now() - interval '180 days'
    and public.is_trusted_hiring_signal_evidence_v1(
      s.signal_type,
      coalesce(
        s.evidence_payload->>'note',
        s.evidence_payload->>'summary',
        s.evidence_payload->>'evidenceText',
        s.evidence_text,
        ''
      )
    )
), signal_agg as (
  select
    company_id,
    bool_or(signal_type='headcount_acceleration') as has_headcount_acceleration,
    bool_or(signal_type='capital_markets_hiring') as has_capital_markets_hiring,
    bool_or(signal_type='funding_team_hiring') as has_funding_team_hiring,
    bool_or(signal_type in ('credit_team_hiring','credit_infrastructure_buildout')) as has_credit_buildout,
    bool_or(signal_type='investor_relationship_signal') as has_investor_signal,
    bool_or(signal_type='fidc_funding_event') as has_fidc_event,
    bool_or(signal_type='structured_debt_funding') as has_structured_debt_event,
    bool_or(signal_type='credit_origination_acceleration') as has_origination_acceleration,
    max(signal_strength) as max_signal_strength,
    avg(nullif(signal_confidence,0)) as avg_signal_confidence,
    count(*) filter (where signal_strength >= 75) as actionable_signal_count
  from signal_base
  group by company_id
), strongest_signal as (
  select distinct on (company_id)
    company_id,
    signal_type,
    signal_strength,
    signal_confidence,
    left(regexp_replace(evidence, '<[^>]+>', ' ', 'g'), 700) as evidence,
    created_at
  from signal_base
  where signal_type in (
    'headcount_acceleration',
    'capital_markets_hiring',
    'funding_team_hiring',
    'credit_team_hiring',
    'credit_infrastructure_buildout',
    'investor_relationship_signal',
    'fidc_funding_event',
    'structured_debt_funding',
    'credit_origination_acceleration',
    'public_financing_signal'
  )
  order by company_id, signal_strength desc, created_at desc
), top_pattern as (
  select distinct on (cp.company_id)
    cp.company_id,
    coalesce(pc.pattern_name, pc.name, pc.code, 'Pattern estrutural em validação') as pattern_name,
    cp.rationale as pattern_rationale,
    coalesce(cp.confidence_score, cp.confidence, 0)::numeric as pattern_confidence
  from public.company_patterns cp
  left join public.pattern_catalog pc on pc.id=cp.pattern_id
  order by cp.company_id, coalesce(cp.confidence_score, cp.confidence, 0) desc, cp.created_at desc
), investor_agg as (
  select
    r.company_id,
    count(distinct r.investor_id)::integer as investor_count,
    count(distinct r.investor_id) filter (where r.is_lead)::integer as lead_investor_count
  from public.company_investor_relationships r
  group by r.company_id
), base as (
  select
    c.id as company_id,
    c.trade_name as company_name,
    q.qualification_score_total,
    q.predicted_funding_need_score,
    q.urgency_score,
    q.source_confidence_score,
    q.trigger_strength_score,
    q.funding_gap_level,
    q.capital_dependency_level,
    q.growth_vs_funding_mismatch,
    q.has_credit_product,
    q.has_receivables,
    q.has_fidc,
    q.has_existing_debt_structure,
    q.fit_fidc,
    q.fit_dcm,
    q.suggested_structure_type,
    q.next_action as qualification_next_action,
    pc.headcount_total,
    pc.previous_headcount,
    pc.headcount_delta,
    pc.calculated_growth_pct,
    pc.growth_basis,
    pc.open_jobs_total,
    pc.strategic_open_jobs,
    pc.strategic_hiring_intent_pct,
    pc.capital_markets_open_jobs,
    pc.funding_treasury_open_jobs,
    pc.credit_risk_open_jobs,
    pc.known_investors as people_known_investors,
    pc.people_timing_score,
    pc.people_capital_rationale,
    coalesce(i.investor_count,0) as investor_count,
    coalesce(i.lead_investor_count,0) as lead_investor_count,
    coalesce(sa.has_headcount_acceleration,false) as has_headcount_acceleration,
    coalesce(sa.has_capital_markets_hiring,false) as has_capital_markets_hiring,
    coalesce(sa.has_funding_team_hiring,false) as has_funding_team_hiring,
    coalesce(sa.has_credit_buildout,false) as has_credit_buildout,
    coalesce(sa.has_investor_signal,false) as has_investor_signal,
    coalesce(sa.has_fidc_event,false) as has_fidc_event,
    coalesce(sa.has_structured_debt_event,false) as has_structured_debt_event,
    coalesce(sa.has_origination_acceleration,false) as has_origination_acceleration,
    coalesce(sa.max_signal_strength,0) as max_signal_strength,
    coalesce(sa.avg_signal_confidence,0) as avg_signal_confidence,
    coalesce(sa.actionable_signal_count,0) as actionable_signal_count,
    ss.signal_type as strongest_signal_type,
    ss.evidence as strongest_signal_evidence,
    tp.pattern_name as detected_pattern,
    tp.pattern_rationale,
    tp.pattern_confidence
  from public.companies c
  left join latest_q q on q.company_id=c.id
  left join public.company_people_capital_snapshot_v1 pc on pc.company_id=c.id
  left join signal_agg sa on sa.company_id=c.id
  left join strongest_signal ss on ss.company_id=c.id
  left join top_pattern tp on tp.company_id=c.id
  left join investor_agg i on i.company_id=c.id
), decision as (
  select
    b.*,
    coalesce(
      b.detected_pattern,
      case
        when b.has_origination_acceleration and not coalesce(b.has_fidc,false) then 'Expansion outpacing capital structure'
        when coalesce(b.calculated_growth_pct,0) >= 15 and coalesce(b.strategic_hiring_intent_pct,0) >= 25 then 'Growth without structured funding'
        when (b.has_capital_markets_hiring or b.has_funding_team_hiring) and not coalesce(b.has_existing_debt_structure,false) then 'Capital mismatch for business model'
        when coalesce(b.has_receivables,false) and coalesce(b.fit_fidc,false) and not coalesce(b.has_fidc,false) then 'Strong receivables base with weak funding architecture'
        when b.has_fidc_event or coalesce(b.has_fidc,false) then 'Structured funding capacity / FIDC optimization'
        when b.has_structured_debt_event then 'Structured debt refinancing / incremental capacity'
        else 'Monitorar convergência entre crescimento, funding e executabilidade'
      end
    ) as probable_pattern,
    case
      when b.has_fidc_event or (coalesce(b.fit_fidc,false) and coalesce(b.has_receivables,false))
        then 'FIDC / warehouse / cessão de recebíveis'
      when b.has_structured_debt_event or coalesce(b.fit_dcm,false)
        then coalesce(nullif(b.suggested_structure_type,''),'DCM / dívida estruturada')
      else coalesce(nullif(b.suggested_structure_type,''),'Estrutura a validar')
    end as suggested_structure,
    case
      when b.has_fidc_event then 'A companhia já demonstra acesso a funding estruturado; o ângulo é capacidade incremental, resize, refinanciamento ou novo veículo conforme crescimento do lastro.'
      when b.has_origination_acceleration then 'A originação/carteira está acelerando; o ângulo é financiar crescimento marginal sem pressionar balanço e casar duration do ativo com o passivo.'
      when b.has_capital_markets_hiring or b.has_funding_team_hiring then 'A companhia está construindo capacidade interna de funding/Capital Markets; abordar durante a definição da arquitetura antes que a solução esteja fechada.'
      when coalesce(b.strategic_hiring_intent_pct,0) >= 25 and coalesce(b.calculated_growth_pct,0) >= 10 then 'Crescimento operacional e hiring estratégico estão avançando juntos; validar se a estrutura de capital acompanha a expansão.'
      when coalesce(b.has_receivables,false) and coalesce(b.fit_fidc,false) then 'Existe base potencial de recebíveis; testar elegibilidade, recorrência e capacidade de transformar lastro em funding dedicado.'
      else 'Validar funding atual, ativos/recebíveis, maturidade operacional e janela de capital antes da abordagem.'
    end as commercial_angle,
    case
      when b.has_fidc_event then 'Mapear FIDC/veículo atual: tamanho, lastro, investidores, custo, prazo, concentração e headroom para capacidade incremental ou refinanciamento.'
      when b.has_structured_debt_event then 'Mapear instrumento de dívida atual: credores, custo, prazo, amortização, covenants e janela de refinanciamento/alongamento.'
      when b.has_origination_acceleration then 'Quantificar originação e carteira, prazo médio, funding disponível e capital marginal necessário para sustentar o crescimento.'
      when b.has_capital_markets_hiring then 'Identificar a vaga/cargo de Capital Markets, senioridade, mandato provável e decisor financeiro; preparar abordagem DCM contextualizada.'
      when b.has_funding_team_hiring then 'Identificar responsável de Funding/Tesouraria e mapear custo, prazo, liquidez e gaps da estrutura atual antes do contato.'
      when b.has_credit_buildout then 'Validar produto, carteira, política de crédito, risco/cobrança e ritmo de contratação; testar se o buildout exige funding dedicado.'
      when coalesce(b.calculated_growth_pct,0) >= 10 then 'Comparar crescimento efetivo do quadro com expansão operacional, vagas estratégicas e funding disponível; validar possível expansion outpacing capital.'
      else coalesce(nullif(b.qualification_next_action,''),'Validar funding atual, recebíveis estruturáveis e responsável financeiro para definir abordagem.')
    end as next_action
  from base b
)
select
  d.*,
  concat_ws(' ',
    case
      when coalesce(d.has_credit_product,false) then 'Produto de crédito/financiamento aumenta dependência de capital escalável.'
      when coalesce(d.has_receivables,false) then 'A companhia gera recebíveis que podem suportar uma estrutura dedicada de funding.'
      when d.funding_gap_level is not null and lower(d.funding_gap_level) not in ('low','none','baixo') then 'A qualificação indica gap ou pressão de funding a validar.'
      else 'A tese de crédito depende da confirmação da necessidade estrutural e dos ativos financiáveis.'
    end,
    case when d.capital_dependency_level is not null then format('Dependência de capital: %s.', replace(d.capital_dependency_level,'_',' ')) end
  ) as why_credit,
  concat_ws(' ',
    nullif(d.people_capital_rationale,''),
    case when nullif(d.strongest_signal_evidence,'') is not null then format('Trigger recente: %s', d.strongest_signal_evidence) end,
    case when d.investor_count > 0 then format('Rede de capital: %s investidor(es) relacionado(s), %s líder(es) identificado(s).',d.investor_count,d.lead_investor_count) end
  ) as why_now,
  least(100, greatest(0, round(
      coalesce(d.predicted_funding_need_score,0) * 0.32
    + coalesce(d.urgency_score,0) * 0.23
    + coalesce(d.people_timing_score,0) * 0.15
    + coalesce(d.trigger_strength_score,0) * 0.15
    + (coalesce(d.source_confidence_score,0) * 100) * 0.10
    + least(5, coalesce(d.actionable_signal_count,0))
  )))::integer as origination_conviction_score,
  least(0.98, greatest(0.35,
    coalesce(nullif(d.source_confidence_score,0),0.55)
    + case when coalesce(d.avg_signal_confidence,0) >= 0.75 then 0.04 else 0 end
    + case when d.people_timing_score >= 40 then 0.03 else 0 end
    + case when d.pattern_confidence >= 0.75 then 0.03 else 0 end
  ))::numeric(5,2) as brief_confidence,
  now() as generated_at
from decision d;

grant select on public.company_origination_brief_v1 to authenticated, service_role;

comment on view public.company_origination_brief_v1 is
  'Deterministic, evidence-based Origination Brief: why credit, why now, probable pattern, suggested structure, commercial angle, next action and conviction score.';

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

  select * into b
  from public.company_origination_brief_v1
  where company_id=p_company_id;

  delete from public.company_signals
  where company_id=p_company_id
    and signal_type='origination_brief';

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

  -- Never overwrite a human next action. Replace only empty/generic machine placeholders.
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

revoke all on function public.refresh_company_origination_brief_v1(uuid) from public;
grant execute on function public.refresh_company_origination_brief_v1(uuid) to service_role;

create or replace function public.trg_refresh_company_origination_brief_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_signal_type text;
  v_metric_key text;
begin
  if tg_op='DELETE' then v_company_id := old.company_id; else v_company_id := new.company_id; end if;

  if tg_table_name='company_signals' then
    v_signal_type := case when tg_op='DELETE' then old.signal_type else new.signal_type end;
    if v_signal_type not in (
      'headcount_acceleration','capital_markets_hiring','funding_team_hiring',
      'credit_team_hiring','credit_infrastructure_buildout','investor_relationship_signal',
      'fidc_funding_event','structured_debt_funding','credit_origination_acceleration',
      'public_financing_signal'
    ) then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  elsif tg_table_name='company_source_metric_snapshots' then
    v_metric_key := case when tg_op='DELETE' then old.metric_key else new.metric_key end;
    if v_metric_key not in ('headcount_total','headcount_growth_pct','headcount_total_inferred_previous') then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  end if;

  perform public.refresh_company_origination_brief_v1(v_company_id);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.trg_refresh_company_origination_brief_v1() from public;

drop trigger if exists trg_origination_brief_from_signals_v1 on public.company_signals;
create trigger trg_origination_brief_from_signals_v1
after insert or update or delete on public.company_signals
for each row execute function public.trg_refresh_company_origination_brief_v1();

drop trigger if exists trg_origination_brief_from_qualification_v1 on public.qualification_snapshots;
create trigger trg_origination_brief_from_qualification_v1
after insert or update or delete on public.qualification_snapshots
for each row execute function public.trg_refresh_company_origination_brief_v1();

drop trigger if exists trg_origination_brief_from_jobs_v1 on public.company_job_openings;
create trigger trg_origination_brief_from_jobs_v1
after insert or update or delete on public.company_job_openings
for each row execute function public.trg_refresh_company_origination_brief_v1();

drop trigger if exists trg_origination_brief_from_metrics_v1 on public.company_source_metric_snapshots;
create trigger trg_origination_brief_from_metrics_v1
after insert or update or delete on public.company_source_metric_snapshots
for each row execute function public.trg_refresh_company_origination_brief_v1();

drop trigger if exists trg_origination_brief_from_investors_v1 on public.company_investor_relationships;
create trigger trg_origination_brief_from_investors_v1
after insert or update or delete on public.company_investor_relationships
for each row execute function public.trg_refresh_company_origination_brief_v1();

drop trigger if exists trg_origination_brief_from_patterns_v1 on public.company_patterns;
create trigger trg_origination_brief_from_patterns_v1
after insert or update or delete on public.company_patterns
for each row execute function public.trg_refresh_company_origination_brief_v1();

create or replace function public.enrich_lead_score_with_origination_brief_v1()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  b public.company_origination_brief_v1%rowtype;
begin
  select * into b from public.company_origination_brief_v1 where company_id=new.company_id;
  if b.company_id is null then return new; end if;

  new.next_action := coalesce(nullif(b.next_action,''),new.next_action);
  new.commercial_angle := coalesce(nullif(b.commercial_angle,''),new.commercial_angle);
  new.suggested_structure := coalesce(nullif(b.suggested_structure,''),new.suggested_structure);
  new.rationale := concat_ws(' ',
    nullif(new.rationale,''),
    format('Origination Brief v1: conviction %s/100; padrão %s.',b.origination_conviction_score,b.probable_pattern)
  );
  return new;
end;
$$;

revoke all on function public.enrich_lead_score_with_origination_brief_v1() from public;

drop trigger if exists trg_enrich_lead_score_with_origination_brief_v1 on public.lead_score_snapshots;
create trigger trg_enrich_lead_score_with_origination_brief_v1
before insert or update on public.lead_score_snapshots
for each row execute function public.enrich_lead_score_with_origination_brief_v1();

-- Initial materialization for the existing Company Master.
do $$
declare
  r record;
begin
  for r in select id from public.companies loop
    perform public.refresh_company_origination_brief_v1(r.id);
  end loop;
end;
$$;
