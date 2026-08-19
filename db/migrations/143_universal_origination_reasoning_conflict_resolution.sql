-- Universal Origination Reasoning v2: conflict resolution + diligence dedupe.
-- Stronger company-level qualification can qualify/override a weaker analytical inference,
-- without deleting the underlying Factor Map evidence.

create or replace view public.company_origination_reasoning_questions_v2
with (security_invoker=true)
as
with ranked as (
  select
    e.company_id,
    e.validation_question,
    max(e.priority_score) priority_score,
    max(e.observed_at) observed_at
  from public.company_origination_reasoning_evidence_v2 e
  where nullif(btrim(e.validation_question),'') is not null
  group by e.company_id,e.validation_question
), ordered as (
  select
    r.*,
    row_number() over(partition by r.company_id order by r.priority_score desc,r.observed_at desc,r.validation_question) rn
  from ranked r
)
select
  company_id,
  array_agg(validation_question order by rn) validation_questions
from ordered
where rn<=6
group by company_id;

grant select on public.company_origination_reasoning_questions_v2 to authenticated,service_role;

create or replace view public.company_origination_reasoning_conflicts_v2
with (security_invoker=true)
as
with latest_q as (
  select distinct on (q.company_id) q.*
  from public.qualification_snapshots q
  order by q.company_id,q.created_at desc,q.id desc
), latest_factor as (
  select distinct on (f.company_id,c.code)
    f.company_id,c.code,f.contribution,f.confidence_score,
    coalesce(f.observed_at,f.created_at) observed_at,
    coalesce(f.evidence_payload->>'note',f.evidence_payload->>'summary',c.hypothesis,c.description) evidence_text
  from public.company_factor_observations f
  join public.origination_factor_catalog c on c.id=f.factor_id and c.active
  where coalesce(f.expires_at,now()+interval '1 day')>now()
  order by f.company_id,c.code,coalesce(f.observed_at,f.created_at) desc,f.created_at desc,f.id desc
)
select
  q.company_id,
  'funding_gap_vs_mature_capital_stack'::text conflict_type,
  'resolved'::text status,
  format(
    'Qualification indica funding_gap_level=%s e capital_structure_quality=%s; funding atual=%s.',
    coalesce(q.funding_gap_level,'n/a'),coalesce(q.capital_structure_quality,'n/a'),coalesce(q.funding_structure_type,'n/a')
  ) stronger_evidence,
  format(
    'Factor Map mantém hipótese %s (contribution %s; confidence %s): %s',
    f.code,round(coalesce(f.contribution,0),2),round(coalesce(f.confidence_score,0),2),coalesce(f.evidence_text,'sem detalhe')
  ) conflicting_inference,
  'Interpretar a oportunidade como funding recorrente de ativos, capacidade incremental, eficiência de emissão ou refinanciamento — não como déficit corporativo.'::text resolution,
  'Qualification company-level e evidência do capital stack prevalecem sobre fator inferido quando apontam baixo gap corporativo.'::text guardrail,
  greatest(q.created_at,f.observed_at) resolved_at
from latest_q q
join latest_factor f on f.company_id=q.company_id and f.code='funding_gap_pressure'
where lower(coalesce(q.funding_gap_level,'')) like 'low%'
  and lower(coalesce(q.capital_structure_quality,'')) in ('mature','high','strong')
  and (coalesce(q.has_fidc,false) or coalesce(q.has_existing_debt_structure,false));

grant select on public.company_origination_reasoning_conflicts_v2 to authenticated,service_role;

create or replace view public.company_origination_brief_v2
with (security_invoker=true)
as
with latest_q as (
  select distinct on (q.company_id) q.*
  from public.qualification_snapshots q
  order by q.company_id,q.created_at desc,q.id desc
), conflicts as (
  select
    company_id,
    jsonb_agg(jsonb_build_object(
      'type',conflict_type,'status',status,'strongerEvidence',stronger_evidence,
      'conflictingInference',conflicting_inference,'resolution',resolution,
      'guardrail',guardrail,'resolvedAt',resolved_at
    ) order by resolved_at desc) reasoning_conflicts,
    (array_agg(resolution order by resolved_at desc))[1] primary_resolution
  from public.company_origination_reasoning_conflicts_v2
  group by company_id
)
select
  b.*,
  r.reasoning_dimensions,r.reasoning_dimension_count,r.reasoning_confidence,r.reasoning_evidence_count,
  r.observed_evidence_count,r.inferred_evidence_count,r.contextual_evidence_count,
  r.reasoning_coverage_pct,r.unmapped_signal_types,
  case
    when cf.primary_resolution is not null then concat_ws(' ',
      nullif(b.why_credit,''),
      format('Postura de capital: %s',cf.primary_resolution)
    )
    else concat_ws(' ',
      nullif(b.why_credit,''),
      case when nullif(r.top_structural_implication,'') is not null
        then format('Leitura financeira adicional: %s',r.top_structural_implication) end
    )
  end why_credit_v2,
  concat_ws(' ',
    nullif(b.why_now,''),
    case when nullif(r.top_timing_fact,'') is not null then format('Trigger/timing: %s',left(r.top_timing_fact,650)) end,
    case when nullif(r.top_timing_implication,'') is not null then format('Implicação: %s',r.top_timing_implication) end
  ) why_now_v2,
  case
    when b.probable_pattern='Monitorar convergência entre crescimento, funding e executabilidade'
      and nullif(r.top_pattern_hint,'') is not null then r.top_pattern_hint
    else b.probable_pattern
  end probable_pattern_v2,
  case
    when b.suggested_structure='Estrutura a validar' and nullif(r.top_structure_hint,'') is not null then r.top_structure_hint
    else b.suggested_structure
  end suggested_structure_v2,
  case
    when cf.primary_resolution is not null then concat_ws(' ',
      cf.primary_resolution,
      case when nullif(q.rationale_summary,'') is not null then format('Qualification: %s',left(q.rationale_summary,900)) end,
      case when nullif(b.commercial_angle,'') is not null then format('Ângulo comercial: %s',b.commercial_angle) end
    )
    else concat_ws(' ',
      nullif(r.top_structural_implication,''),nullif(r.top_execution_implication,''),
      case when nullif(b.commercial_angle,'') is not null then format('Ângulo comercial: %s',b.commercial_angle) end
    )
  end commercial_angle_v2,
  case
    when coalesce(r.top_risk_strength,0)>=80 and nullif(r.top_risk_next_action,'') is not null then r.top_risk_next_action
    when cf.primary_resolution is not null then 'Mapear calendário de emissões e vencimentos, headroom/capacidade incremental, custo e prazo do funding atual e agenda do responsável de Capital Markets/Tesouraria.'
    else coalesce(nullif(r.top_next_action,''),b.next_action)
  end next_action_v2,
  case
    when nullif(r.top_risk_fact,'') is not null then concat_ws(' ',
      format('Risco: %s',left(r.top_risk_fact,700)),nullif(r.top_risk_guardrail,'')
    )
  end risks_to_validate,
  nullif(array_to_string(coalesce(qs.validation_questions,r.validation_questions),' | '),'') missing_evidence
from public.company_origination_brief_v1 b
left join public.company_origination_reasoning_v2 r on r.company_id=b.company_id
left join public.company_origination_reasoning_questions_v2 qs on qs.company_id=b.company_id
left join latest_q q on q.company_id=b.company_id
left join conflicts cf on cf.company_id=b.company_id;

grant select on public.company_origination_brief_v2 to authenticated,service_role;

create or replace function public.refresh_company_origination_brief_v1(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.company_origination_brief_v2%rowtype;
  v_note text;
  v_conflicts jsonb := '[]'::jsonb;
begin
  if p_company_id is null then return; end if;

  delete from public.company_signals
  where company_id=p_company_id and signal_type='origination_brief';

  if not public.is_company_origination_brief_eligible_v1(p_company_id) then return; end if;

  select * into b from public.company_origination_brief_v2 where company_id=p_company_id;
  if b.company_id is null then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type',conflict_type,'status',status,'strongerEvidence',stronger_evidence,
    'conflictingInference',conflicting_inference,'resolution',resolution,
    'guardrail',guardrail,'resolvedAt',resolved_at
  ) order by resolved_at desc),'[]'::jsonb)
  into v_conflicts
  from public.company_origination_reasoning_conflicts_v2
  where company_id=p_company_id;

  v_note:=concat_ws(' ',
    case when nullif(b.why_credit_v2,'') is not null then format('Por que crédito: %s',b.why_credit_v2) end,
    case when nullif(b.why_now_v2,'') is not null then format('Por que agora: %s',b.why_now_v2) end,
    format('Padrão provável: %s.',b.probable_pattern_v2),
    format('Estrutura sugerida: %s.',b.suggested_structure_v2),
    case when nullif(b.risks_to_validate,'') is not null then format('Riscos/condicionantes: %s',b.risks_to_validate) end,
    case when jsonb_array_length(v_conflicts)>0 then format('Conflitos de evidência resolvidos: %s.',jsonb_array_length(v_conflicts)) end,
    case when nullif(b.missing_evidence,'') is not null then format('Evidência faltante: %s',b.missing_evidence) end,
    format('Próxima ação: %s',b.next_action_v2)
  );

  insert into public.company_signals(
    company_id,signal_type,signal_label,strength,confidence,is_explicit,evidence_text,observed_at,
    metadata,source_id,signal_strength,confidence_score,evidence_payload,observed_vs_inferred,created_at,updated_at
  ) values (
    p_company_id,'origination_brief','Universal Origination Reasoning',
    b.origination_conviction_score,round(b.brief_confidence*100,2),false,v_note,now(),
    jsonb_build_object('version','v2','derived',true,'decisionArtifact',true,'scoreNeutral',true),
    null,b.origination_conviction_score,b.brief_confidence,
    jsonb_build_object(
      'version','v2','note',v_note,'whyCredit',b.why_credit_v2,'whyNow',b.why_now_v2,
      'probablePattern',b.probable_pattern_v2,'suggestedStructure',b.suggested_structure_v2,
      'commercialAngle',b.commercial_angle_v2,'risksToValidate',b.risks_to_validate,
      'reasoningConflicts',v_conflicts,'missingEvidence',b.missing_evidence,'nextAction',b.next_action_v2,
      'reasoningDimensions',b.reasoning_dimensions,'reasoningCoveragePct',b.reasoning_coverage_pct,
      'reasoningConfidence',b.reasoning_confidence,'reasoningEvidenceCount',b.reasoning_evidence_count,
      'observedEvidenceCount',b.observed_evidence_count,'inferredEvidenceCount',b.inferred_evidence_count,
      'contextualEvidenceCount',b.contextual_evidence_count,'unmappedSignalTypes',to_jsonb(b.unmapped_signal_types),
      'originationConvictionScore',b.origination_conviction_score,'briefConfidence',b.brief_confidence,
      'scoreNeutral',true
    ),
    'recommended',now(),now()
  );

  update public.pipeline p
  set next_action=b.next_action_v2,
      expected_structure=coalesce(nullif(p.expected_structure,''),b.suggested_structure_v2),
      updated_at=now()
  where p.company_id=p_company_id
    and (
      p.next_action is null or btrim(p.next_action)=''
      or lower(btrim(p.next_action)) in (
        'executar análise comercial','executar analise comercial',
        'definir próximo passo comercial','definir proximo passo comercial'
      )
    );
end;
$$;

revoke all on function public.refresh_company_origination_brief_v1(uuid) from public;
grant execute on function public.refresh_company_origination_brief_v1(uuid) to service_role;

do $$
declare r record;
begin
  for r in select id from public.companies where public.is_company_origination_brief_eligible_v1(id) loop
    perform public.refresh_company_origination_brief_v1(r.id);
  end loop;
end;
$$;
