-- Universal Origination Reasoning v2 calibration
-- Keeps macro validation context from masquerading as a company red flag and deduplicates Factor Map history.

create or replace view public.company_origination_reasoning_evidence_v2
with (security_invoker=true)
as
with signal_rows as (
  select
    s.company_id,
    'signal'::text evidence_kind,
    s.id::text evidence_ref,
    s.signal_type evidence_key,
    m.j->>'domain' reasoning_domain,
    case when s.signal_type='risk_validation_signal' then 'context' else m.j->>'decisionDimension' end decision_dimension,
    case
      when s.signal_type='risk_validation_signal' then 'contextual'
      when s.observed_vs_inferred in ('observed','inferred','estimated') then s.observed_vs_inferred
      else m.j->>'semantics'
    end semantics,
    coalesce(s.signal_strength,s.strength,0)::numeric strength,
    least(1,greatest(0,
      case when coalesce(s.confidence_score,0)>0 then s.confidence_score else coalesce(s.confidence,0)/100.0 end
    ))::numeric confidence,
    left(coalesce(
      s.evidence_payload->>'note',s.evidence_payload->>'summary',
      s.evidence_payload->>'evidenceText',s.evidence_text,s.signal_label,s.signal_type
    ),1200) evidence_text,
    m.j->>'financialImplication' financial_implication,
    nullif(m.j->>'patternHint','') pattern_hint,
    nullif(m.j->>'structureHint','') structure_hint,
    m.j->>'validationQuestion' validation_question,
    m.j->>'nextAction' next_action,
    m.j->>'guardrail' guardrail,
    coalesce(s.observed_at,s.created_at) observed_at,
    (
      (coalesce(s.signal_strength,s.strength,0)/100.0)
      * greatest(0.1,least(1,case when coalesce(s.confidence_score,0)>0 then s.confidence_score else coalesce(s.confidence,0)/100.0 end))
      * case when s.signal_type='risk_validation_signal' then 0.25 else coalesce((m.j->>'priorityWeight')::numeric,0) end
    )::numeric priority_score
  from public.company_signals s
  cross join lateral (select public.origination_signal_reasoning_v2(s.signal_type) j) m
  where s.signal_type<>'origination_brief'
    and s.created_at>=now()-interval '365 days'
    and coalesce((m.j->>'mapped')::boolean,false)
    and public.is_trusted_hiring_signal_evidence_v1(
      s.signal_type,
      coalesce(s.evidence_payload->>'note',s.evidence_payload->>'summary',s.evidence_payload->>'evidenceText',s.evidence_text,'')
    )
),
latest_factor as (
  select distinct on (f.company_id,f.factor_id) f.*
  from public.company_factor_observations f
  where coalesce(f.observed_at,f.created_at)>=now()-interval '365 days'
    and coalesce(f.expires_at,now()+interval '1 day')>now()
  order by f.company_id,f.factor_id,coalesce(f.observed_at,f.created_at) desc,f.created_at desc,f.id desc
),
factor_rows as (
  select
    f.company_id,
    'factor'::text evidence_kind,
    f.id::text evidence_ref,
    c.code evidence_key,
    case c.dimension
      when 'funding_need' then 'Funding Need'
      when 'fidc_fit' then 'FIDC Fit'
      when 'dcm_fit' then 'Capital Markets'
      when 'executability' then 'Execution'
      when 'risk' then 'Risk'
      when 'timing' then 'Timing'
      else initcap(replace(c.dimension,'_',' '))
    end reasoning_domain,
    case c.dimension
      when 'funding_need' then 'structural_need'
      when 'risk' then 'risk'
      when 'timing' then 'timing'
      when 'fidc_fit' then 'executability'
      when 'dcm_fit' then 'executability'
      when 'executability' then 'executability'
      else 'context'
    end decision_dimension,
    'inferred'::text semantics,
    least(100,greatest(0,coalesce(f.signal_strength,0)))::numeric strength,
    least(1,greatest(0,coalesce(f.confidence_score,0)))::numeric confidence,
    left(coalesce(f.evidence_payload->>'note',f.evidence_payload->>'summary',c.description,c.name),1200) evidence_text,
    format('Hipótese analítica do Factor Map (%s): %s',c.name,coalesce(c.hypothesis,c.description)) financial_implication,
    c.name pattern_hint,
    null::text structure_hint,
    format('Quais evidências observadas confirmam o fator "%s" e sua materialidade financeira?',c.name) validation_question,
    case c.dimension
      when 'funding_need' then 'Quantificar necessidade, prazo, ativos e funding atual associado ao fator.'
      when 'fidc_fit' then 'Validar lastro, elegibilidade, performance, concentração e cessibilidade.'
      when 'dcm_fit' then 'Validar instrumento, ticket, prazo, garantias, calendário de dívida e janela de mercado.'
      when 'risk' then 'Validar materialidade, status e mitigantes antes de avançar.'
      else 'Validar o fator em fonte primária e conectá-lo à decisão de originação.'
    end next_action,
    case c.dimension
      when 'funding_need' then 'Fator derivado aumenta hipótese de necessidade, mas exige fatos observados de ativos/passivos.'
      when 'fidc_fit' then 'Fit de recebíveis não prova necessidade nem qualidade do lastro.'
      when 'dcm_fit' then 'Acesso/fit DCM não prova funding gap.'
      when 'risk' then 'Risco pode aumentar urgência e simultaneamente reduzir executabilidade.'
      else 'Factor Map é evidência analítica; não substituir o fato observado.'
    end guardrail,
    coalesce(f.observed_at,f.created_at) observed_at,
    (
      least(1,greatest(0,coalesce(f.contribution,0))/20.0)
      * greatest(0.1,least(1,coalesce(f.confidence_score,0)))
      * coalesce(c.default_weight,1)
    )::numeric priority_score
  from latest_factor f
  join public.origination_factor_catalog c on c.id=f.factor_id and c.active
),
latest_q as (
  select distinct on (q.company_id) q.*
  from public.qualification_snapshots q
  order by q.company_id,q.created_at desc,q.id desc
),
qualification_rows as (
  select
    q.company_id,
    'qualification'::text evidence_kind,
    'qualification:'||x.key evidence_ref,
    x.key evidence_key,
    x.domain reasoning_domain,
    x.dimension decision_dimension,
    'inferred'::text semantics,
    least(100,greatest(0,x.strength))::numeric strength,
    least(1,greatest(0,coalesce(nullif(q.confidence_score,0),nullif(q.source_confidence_score,0),0.5)))::numeric confidence,
    x.evidence evidence_text,
    x.implication financial_implication,
    x.pattern_hint,
    x.structure_hint,
    x.validation_question,
    x.next_action,
    x.guardrail,
    q.created_at observed_at,
    (
      least(1,greatest(0,x.strength)/100.0)
      * greatest(0.1,least(1,coalesce(nullif(q.confidence_score,0),nullif(q.source_confidence_score,0),0.5)))
    )::numeric priority_score
  from latest_q q
  cross join lateral (values
    (
      'funding_need','Funding Need','structural_need',
      coalesce(q.predicted_funding_need_score,q.qualification_score_capital,0)::numeric,
      format('Funding gap: %s; dependência de capital: %s; mismatch crescimento/funding: %s.',
        coalesce(q.funding_gap_level,'n/a'),coalesce(q.capital_dependency_level,'n/a'),coalesce(q.growth_vs_funding_mismatch,'n/a')),
      'A qualificação consolidada indica o grau de pressão estrutural de capital a validar.',
      'Funding gap / capital mismatch',
      coalesce(nullif(q.suggested_structure_type,''),'Estrutura a validar'),
      'Qual montante, prazo, uso e evento torna a necessidade de funding material agora?',
      'Quantificar a necessidade e reconciliar com funding disponível e plano de crescimento.',
      'Qualification é inferência consolidada e não substitui evidência financeira observada.'
    ),
    (
      'receivables','Receivables','executability',
      coalesce(q.qualification_score_receivables,0)::numeric,
      format('Recebíveis: %s; recorrência: %s; previsibilidade: %s; estruturáveis: %s.',
        array_to_string(coalesce(q.receivables_type,array[]::text[]),', '),
        coalesce(q.receivables_recurrence_level,'n/a'),coalesce(q.receivables_predictability_level,'n/a'),
        coalesce(q.receivables_structurable::text,'n/a')),
      'Qualidade, recorrência e estruturabilidade dos recebíveis determinam o fit real para FIDC/warehouse.',
      'Receivables quality',
      case when q.fit_fidc then 'FIDC / warehouse / cessão' else null end,
      'Há tape, aging, concentração, performance e documentação suficientes para validar o lastro?',
      'Solicitar dados da carteira e validar elegibilidade, concentração, prazo, performance e cessibilidade.',
      'Fit não equivale a funding need e recebível não equivale a lastro elegível.'
    ),
    (
      'capital_structure','Capital Structure','executability',
      coalesce(q.qualification_score_capital,0)::numeric,
      format('Funding atual: %s; qualidade: %s; FIDC: %s; dívida estruturada: %s.',
        coalesce(q.funding_structure_type,'n/a'),coalesce(q.capital_structure_quality,'n/a'),
        coalesce(q.has_fidc::text,'n/a'),coalesce(q.has_existing_debt_structure::text,'n/a')),
      'A estrutura atual define se o ângulo é primeiro funding, capacidade incremental, alongamento ou refinanciamento.',
      'Capital structure',
      coalesce(nullif(q.suggested_structure_type,''),case when q.fit_dcm then 'DCM' when q.fit_fidc then 'FIDC' end),
      'Qual custo, prazo, saldo, amortização, garantia, covenant e headroom do funding atual?',
      'Montar capital stack e calendário de vencimentos antes da abordagem.',
      'Funding existente comprova acesso; não assumir necessidade adicional.'
    ),
    (
      'execution','Execution','executability',
      coalesce(q.qualification_score_execution,0)::numeric,
      format('Governança: %s; risco: %s; underwriting: %s; operação: %s; readiness: %s.',
        coalesce(q.governance_maturity_level,'n/a'),coalesce(q.risk_model_maturity_level,'n/a'),
        coalesce(q.underwriting_maturity_level,'n/a'),coalesce(q.operational_maturity_level,'n/a'),
        coalesce(q.execution_readiness_level,'n/a')),
      'Maturidade de governança, risco e operação determina viabilidade de diligência e execução institucional.',
      'Execution readiness',null,
      'Quais políticas, dados, controles, aprovações e responsáveis ainda faltam para uma operação institucional?',
      'Mapear gaps de governança, dados, risco e operação que bloqueiam execução.',
      'Alta necessidade com baixa executabilidade não deve virar prioridade automática.'
    ),
    (
      'timing','Timing','timing',
      coalesce(q.qualification_score_timing,q.urgency_score,0)::numeric,
      format('Timing: %s; intensidade: %s; urgency score: %s.',
        coalesce(q.timing,'n/a'),coalesce(q.timing_intensity_level,'n/a'),coalesce(q.urgency_score::text,'n/a')),
      'Timing consolida intensidade recente dos triggers e indica quando abordar, não se a necessidade existe por si só.',
      'Timing trigger',null,
      'Qual evento mudou recentemente e por que a janela é melhor agora do que há 90 dias?',
      'Identificar o trigger recente dominante e validar sua materialidade financeira.',
      'Timing nunca deve criar structural need sozinho.'
    ),
    (
      'risk','Risk','risk',
      greatest(
        case lower(coalesce(q.concentration_risk_level,'')) when 'high' then 90 when 'medium' then 60 else 20 end,
        case lower(coalesce(q.delinquency_signal_level,'')) when 'high' then 90 when 'medium' then 60 else 20 end
      )::numeric,
      format('Concentração: %s; inadimplência: %s; unit economics: %s; spread/funding: %s.',
        coalesce(q.concentration_risk_level,'n/a'),coalesce(q.delinquency_signal_level,'n/a'),
        coalesce(q.unit_economics_quality,'n/a'),coalesce(q.spread_vs_funding_quality,'n/a')),
      'Concentração, inadimplência e economics podem transformar uma oportunidade de funding em risco de crédito/execução.',
      'Risk / asset quality',null,
      'Qual concentração, delinquency/vintage, spread líquido e stress do lastro?',
      'Validar concentração, vintages, inadimplência, recoveries e economics antes de estruturar.',
      'Risco pode aumentar urgência, mas deve reduzir executabilidade quando material.'
    )
  ) as x(key,domain,dimension,strength,evidence,implication,pattern_hint,structure_hint,validation_question,next_action,guardrail)
)
select * from signal_rows
union all select * from factor_rows
union all select * from qualification_rows;

grant select on public.company_origination_reasoning_evidence_v2 to authenticated,service_role;

create or replace view public.company_origination_reasoning_v2
with (security_invoker=true)
as
with ranked as (
  select
    e.*,
    row_number() over(partition by e.company_id,e.decision_dimension order by e.priority_score desc,e.observed_at desc,e.evidence_kind,e.evidence_key) rn
  from public.company_origination_reasoning_evidence_v2 e
),
top_rows as (
  select * from ranked where rn<=3
),
dimensions as (
  select
    company_id,
    decision_dimension,
    round(max(priority_score)*100,1) dimension_priority_score,
    round(avg(confidence)::numeric,2) dimension_confidence,
    count(*)::integer evidence_count,
    jsonb_agg(
      jsonb_build_object(
        'kind',evidence_kind,'key',evidence_key,'domain',reasoning_domain,'semantics',semantics,
        'strength',strength,'confidence',round(confidence,2),'fact',evidence_text,
        'financialImplication',financial_implication,'patternHint',pattern_hint,'structureHint',structure_hint,
        'validationQuestion',validation_question,'nextAction',next_action,'guardrail',guardrail,'observedAt',observed_at
      )
      order by priority_score desc,observed_at desc
    ) evidence,
    (array_agg(financial_implication order by priority_score desc,observed_at desc))[1] financial_implication,
    (array_agg(pattern_hint order by priority_score desc,observed_at desc) filter(where pattern_hint is not null))[1] pattern_hint,
    (array_agg(structure_hint order by priority_score desc,observed_at desc) filter(where structure_hint is not null))[1] structure_hint,
    (array_agg(validation_question order by priority_score desc,observed_at desc))[1] validation_question,
    (array_agg(next_action order by priority_score desc,observed_at desc))[1] next_action,
    (array_agg(guardrail order by priority_score desc,observed_at desc))[1] guardrail,
    max(observed_at) last_observed_at
  from top_rows
  group by company_id,decision_dimension
),
packed as (
  select
    company_id,
    jsonb_agg(
      jsonb_build_object(
        'decisionDimension',decision_dimension,'priorityScore',dimension_priority_score,'confidence',dimension_confidence,
        'evidenceCount',evidence_count,'evidence',evidence,'financialImplication',financial_implication,
        'patternHint',pattern_hint,'structureHint',structure_hint,'validationQuestion',validation_question,
        'nextAction',next_action,'guardrail',guardrail,'lastObservedAt',last_observed_at
      )
      order by case decision_dimension when 'structural_need' then 1 when 'timing' then 2 when 'executability' then 3 when 'risk' then 4 else 5 end
    ) reasoning_dimensions,
    count(*)::integer reasoning_dimension_count,
    round(avg(dimension_confidence)::numeric,2) reasoning_confidence
  from dimensions
  group by company_id
),
stats as (
  select
    company_id,
    count(*)::integer reasoning_evidence_count,
    count(*) filter(where semantics='observed')::integer observed_evidence_count,
    count(*) filter(where semantics in ('inferred','estimated'))::integer inferred_evidence_count,
    count(*) filter(where semantics='contextual')::integer contextual_evidence_count,
    (array_agg(evidence_text order by priority_score desc,observed_at desc) filter(where decision_dimension='structural_need'))[1] top_structural_fact,
    (array_agg(financial_implication order by priority_score desc,observed_at desc) filter(where decision_dimension='structural_need'))[1] top_structural_implication,
    (array_agg(pattern_hint order by priority_score desc,observed_at desc) filter(where decision_dimension='structural_need' and pattern_hint is not null))[1] top_pattern_hint,
    (array_agg(structure_hint order by priority_score desc,observed_at desc) filter(where structure_hint is not null and decision_dimension in ('structural_need','executability')))[1] top_structure_hint,
    (array_agg(evidence_text order by priority_score desc,observed_at desc) filter(where decision_dimension='timing'))[1] top_timing_fact,
    (array_agg(financial_implication order by priority_score desc,observed_at desc) filter(where decision_dimension='timing'))[1] top_timing_implication,
    (array_agg(financial_implication order by priority_score desc,observed_at desc) filter(where decision_dimension='executability'))[1] top_execution_implication,
    (array_agg(next_action order by priority_score desc,observed_at desc) filter(where decision_dimension in ('structural_need','timing','executability')))[1] top_next_action,
    (array_agg(evidence_text order by priority_score desc,observed_at desc) filter(where decision_dimension='risk'))[1] top_risk_fact,
    (array_agg(financial_implication order by priority_score desc,observed_at desc) filter(where decision_dimension='risk'))[1] top_risk_implication,
    (array_agg(next_action order by priority_score desc,observed_at desc) filter(where decision_dimension='risk'))[1] top_risk_next_action,
    (array_agg(guardrail order by priority_score desc,observed_at desc) filter(where decision_dimension='risk'))[1] top_risk_guardrail,
    max(strength) filter(where decision_dimension='risk') top_risk_strength
  from public.company_origination_reasoning_evidence_v2
  group by company_id
),
questions as (
  select company_id,
    (array_agg(validation_question order by priority_score desc,observed_at desc))[1:6] validation_questions
  from top_rows
  group by company_id
),
coverage as (
  select
    s.company_id,
    count(*) filter(where s.signal_type<>'origination_brief')::integer total_signals,
    count(*) filter(where s.signal_type<>'origination_brief' and coalesce((public.origination_signal_reasoning_v2(s.signal_type)->>'mapped')::boolean,false))::integer mapped_signals,
    array_remove(array_agg(distinct case
      when s.signal_type<>'origination_brief'
       and not coalesce((public.origination_signal_reasoning_v2(s.signal_type)->>'mapped')::boolean,false)
      then s.signal_type end),null) unmapped_signal_types
  from public.company_signals s
  group by s.company_id
)
select
  c.id company_id,c.trade_name company_name,
  coalesce(p.reasoning_dimensions,'[]'::jsonb) reasoning_dimensions,
  coalesce(p.reasoning_dimension_count,0) reasoning_dimension_count,
  coalesce(p.reasoning_confidence,0) reasoning_confidence,
  coalesce(st.reasoning_evidence_count,0) reasoning_evidence_count,
  coalesce(st.observed_evidence_count,0) observed_evidence_count,
  coalesce(st.inferred_evidence_count,0) inferred_evidence_count,
  coalesce(st.contextual_evidence_count,0) contextual_evidence_count,
  st.top_structural_fact,st.top_structural_implication,st.top_pattern_hint,st.top_structure_hint,
  st.top_timing_fact,st.top_timing_implication,st.top_execution_implication,st.top_next_action,
  st.top_risk_fact,st.top_risk_implication,st.top_risk_next_action,st.top_risk_guardrail,st.top_risk_strength,
  coalesce(qs.validation_questions,array[]::text[]) validation_questions,
  coalesce(cv.total_signals,0) total_signals,coalesce(cv.mapped_signals,0) mapped_signals,
  case when coalesce(cv.total_signals,0)=0 then 100
       else round((coalesce(cv.mapped_signals,0)::numeric/cv.total_signals)*100,1) end reasoning_coverage_pct,
  coalesce(cv.unmapped_signal_types,array[]::text[]) unmapped_signal_types
from public.companies c
left join packed p on p.company_id=c.id
left join stats st on st.company_id=c.id
left join questions qs on qs.company_id=c.id
left join coverage cv on cv.company_id=c.id;

grant select on public.company_origination_reasoning_v2 to authenticated,service_role;

do $$
declare r record;
begin
  for r in select id from public.companies where public.is_company_origination_brief_eligible_v1(id) loop
    perform public.refresh_company_origination_brief_v1(r.id);
  end loop;
end;
$$;
