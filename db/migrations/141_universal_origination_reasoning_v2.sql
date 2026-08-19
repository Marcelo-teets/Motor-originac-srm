-- Universal Origination Reasoning v2
-- Generalizes the Origination Intelligence Brief beyond People & Capital.
-- Canonical chain: observed fact -> financial implication -> pattern -> structure -> timing/risk -> missing evidence -> next action.
-- IMPORTANT: this layer is score-neutral. Existing Source Treatment / Factor Map / Qualification remain the score engines.

create or replace function public.origination_signal_reasoning_v2(p_signal_type text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  s text := lower(coalesce(p_signal_type,''));
begin
  if s ~ '^(funding_gap_signal|funding_pressure|capital_mismatch|cross_capital_structure|growth_without_funding)$' then
    return jsonb_build_object(
      'mapped',true,'domain','Funding Need','decisionDimension','structural_need','semantics','inferred','priorityWeight',1.5,
      'financialImplication','Há evidência de pressão entre crescimento/ativos e a arquitetura de funding disponível.',
      'patternHint','Funding gap / capital mismatch','structureHint','FIDC, warehouse ou DCM conforme ativo e prazo',
      'validationQuestion','Qual é o gap em valor, prazo, uso dos recursos e recorrência?',
      'nextAction','Quantificar necessidade, prazo, ativos financiáveis e funding já contratado.',
      'guardrail','Funding gap derivado precisa de fatos observados de ativos/passivos; não tratar o sinal isolado como necessidade comprovada.'
    );
  end if;

  if s ~ '^(dcm_fit_signal|capital_market_event|structured_debt_funding|fidc_funding_event|public_financing_signal|linkedin_capital_markets_team_signal)$' then
    return jsonb_build_object(
      'mapped',true,'domain','Capital Markets','decisionDimension','executability','semantics','observed','priorityWeight',1.35,
      'financialImplication','Há evidência de acesso, capacidade ou prontidão para funding institucional/mercado de capitais.',
      'patternHint','Capital markets access / structured funding capacity','structureHint','DCM/FIDC a calibrar conforme ativos e passivos',
      'validationQuestion','Qual instrumento, saldo, custo, prazo, amortização, garantias, covenants e headroom atuais?',
      'nextAction','Montar mapa do funding vigente e identificar capacidade incremental, alongamento ou refinanciamento.',
      'guardrail','Acesso ou funding existente comprova executabilidade; não prova funding gap atual.'
    );
  end if;

  if s ~ '^(fidc_fit_signal|fidc_dataset_update_signal)$' then
    return jsonb_build_object(
      'mapped',true,'domain','FIDC Fit','decisionDimension','executability',
      'semantics',case when s='fidc_dataset_update_signal' then 'contextual' else 'inferred' end,
      'priorityWeight',case when s='fidc_dataset_update_signal' then 0.2 else 1.3 end,
      'financialImplication','A natureza dos ativos ou o contexto de mercado é compatível com análise de securitização.',
      'patternHint','Receivables / FIDC fit','structureHint','FIDC, warehouse ou cessão de recebíveis',
      'validationQuestion','Os recebíveis são recorrentes, elegíveis, cedíveis, performados e suficientemente pulverizados?',
      'nextAction','Validar lastro, elegibilidade, recorrência, concentração, prazo, performance e cessibilidade.',
      'guardrail','Fit FIDC e contexto de mercado não provam necessidade de capital nem qualidade do lastro.'
    );
  end if;

  if s ~ '^(fidc_maturity|capital_market_refinancing_window)$' then
    return jsonb_build_object(
      'mapped',true,'domain','Refinancing','decisionDimension','timing','semantics','observed','priorityWeight',1.7,
      'financialImplication','Maturidade ou vencimento próximo cria janela objetiva para refinanciamento e abordagem.',
      'patternHint','Refinancing window','structureHint','Rollover, novo FIDC, debênture ou nota comercial',
      'validationQuestion','Qual saldo, vencimento, amortização, covenant, caixa disponível e intenção de rollover?',
      'nextAction','Mapear cronograma de dívida e iniciar abordagem antes da janela de vencimento.',
      'guardrail','Vencimento cria timing; pressão de funding depende de caixa, plano de refinanciamento e capacidade de acesso.'
    );
  end if;

  if s ~ '(receivables|public_contract)' then
    return jsonb_build_object(
      'mapped',true,'domain','Receivables','decisionDimension',
        case when s ~ '(growth|origination_acceleration)' then 'timing' else 'structural_need' end,
      'semantics',case when s ~ '(detected|strong|cross_)' then 'inferred' else 'observed' end,
      'priorityWeight',1.45,
      'financialImplication','Recebíveis podem criar ativos financiáveis e necessidade de capital compatível com funding dedicado.',
      'patternHint','Receivables strong / funding architecture','structureHint','FIDC, warehouse ou cessão de recebíveis',
      'validationQuestion','Qual origem, volume, recorrência, prazo, concentração, performance, elegibilidade e cessibilidade da carteira?',
      'nextAction','Validar carteira/tape, aging, devedores, concentração, prazo médio, performance e funding atual.',
      'guardrail','Existência ou crescimento de recebíveis aumenta fit/timing; não significa automaticamente lastro elegível ou funding gap.'
    );
  end if;

  if s ~ '(credit_product|product_credit_terms|embedded_finance|financial_infrastructure)' then
    return jsonb_build_object(
      'mapped',true,'domain','Credit Product','decisionDimension','structural_need',
      'semantics',case when s ~ '(detected|embedded_finance$)' then 'inferred' else 'observed' end,
      'priorityWeight',1.4,
      'financialImplication','Crédito/financiamento no produto aumenta dependência potencial de capital escalável conforme a carteira cresce.',
      'patternHint','Embedded finance pressure / credit is core','structureHint','Funding dedicado, FIDC, warehouse ou dívida estruturada',
      'validationQuestion','Crédito é core? Quem toma, qual ativo é gerado, quem assume risco e como a originação é financiada hoje?',
      'nextAction','Mapear produto, originação, carteira, funding, spreads, política de risco e economics.',
      'guardrail','Produto ou infraestrutura de crédito não implica automaticamente carteira própria, volume material ou funding gap.'
    );
  end if;

  if s ~ '(growth|expansion|b2b_|enterprise_go_to_market|media_growth)' then
    return jsonb_build_object(
      'mapped',true,'domain','Growth','decisionDimension','timing',
      'semantics',case when s ~ '(signal|trigger|pressure)' then 'inferred' else 'observed' end,
      'priorityWeight',0.9,
      'financialImplication','Aceleração operacional pode intensificar capital de giro, capex, carteira ou recebíveis e melhorar a janela de abordagem.',
      'patternHint','Expansion outpacing capital','structureHint',null,
      'validationQuestion','Qual métrica de crescimento mudou e como ela afeta capital de giro, ativos, carteira ou geração de caixa?',
      'nextAction','Quantificar crescimento, consumo de capital, prazo de payback e funding disponível.',
      'guardrail','Crescimento é timing; só vira tese de crédito quando ligado a necessidade estrutural de capital.'
    );
  end if;

  if s ~ '(hiring|headcount|linkedin_credit_team)' then
    return jsonb_build_object(
      'mapped',true,'domain','People & Capital','decisionDimension',
        case when s ~ '(linkedin_|capital_markets)' then 'executability' else 'timing' end,
      'semantics','observed','priorityWeight',1.0,
      'financialImplication','Mudança explícita de headcount/time estratégico pode antecipar expansão de crédito, funding ou capacidade de execução.',
      'patternHint','Team buildout / growth acceleration','structureHint',null,
      'validationQuestion','Qual área, senioridade, volume de vagas e conexão com produto, carteira ou agenda de capital?',
      'nextAction','Mapear time, vagas, decisor e cruzar com expansão, carteira, funding e estrutura de capital.',
      'guardrail','Hiring mede intenção/readiness; não prova contratações realizadas nem necessidade de funding.'
    );
  end if;

  if s ~ '(vc_portfolio|venture_backed|investor_relationship|media_funding_event)' then
    return jsonb_build_object(
      'mapped',true,'domain','Capital Network','decisionDimension',
        case when s='media_funding_event_signal' then 'timing' else 'executability' end,
      'semantics','observed','priorityWeight',0.8,
      'financialImplication','Sponsor/investidor institucional melhora governança, acesso e contexto de capital; rodada recente altera o ciclo de liquidez.',
      'patternHint','Capital cycle / sponsor support','structureHint',null,
      'validationQuestion','Quem são investidores, estágio, participação, tipo da rodada, uso dos recursos e histórico de follow-ons/dívida?',
      'nextAction','Mapear grafo de investidores, rodada, warm intros, uso de recursos e provável próxima necessidade de capital.',
      'guardrail','Venture backing ou equity recente não implica dívida; equity pode reduzir necessidade imediata de funding.'
    );
  end if;

  if s ~ '(risk|fiscal_stress|judicial_stress|legal_compliance|liquidity_stress|demand_quality|collections_stack|underwriting)' then
    return jsonb_build_object(
      'mapped',true,'domain','Risk','decisionDimension',
        case when s ~ '(collections_stack|underwriting)' then 'executability' else 'risk' end,
      'semantics',case when s='risk_validation_signal' then 'inferred' else 'observed' end,
      'priorityWeight',case when s ~ '(judicial|legal_compliance|liquidity)' then 1.7 else 1.2 end,
      'financialImplication','Risco, asset quality ou maturidade de controles pode alterar executabilidade, garantias e desenho da operação.',
      'patternHint','Risk / asset quality / governance','structureHint',null,
      'validationQuestion','Qual materialidade, data, status, tendência e impacto sobre caixa, carteira, recebíveis ou governança?',
      'nextAction','Validar fonte primária, materialidade, mitigantes e impacto sobre elegibilidade/estrutura antes de avançar.',
      'guardrail','Risco pode aumentar urgência e simultaneamente reduzir executabilidade; urgência nunca deve compensar red flags.'
    );
  end if;

  if s ~ '(regulatory_event|corporate_structure_change)' then
    return jsonb_build_object(
      'mapped',true,'domain','Governance & Regulation','decisionDimension','timing','semantics','observed','priorityWeight',1.0,
      'financialImplication','Mudança regulatória ou societária pode alterar produto, sponsor, governança ou iniciar novo ciclo de capital.',
      'patternHint','Governance / capital cycle change','structureHint',null,
      'validationQuestion','Qual ato/mudança, vigência, materialidade, controlador/sponsor e impacto financeiro?',
      'nextAction','Confirmar evento em fonte oficial e traduzir impacto sobre capital, funding, produto e decisores.',
      'guardrail','Cadastro estático não é trigger; exigir mudança temporal real e impacto material.'
    );
  end if;

  if s ~ '(technical_product|product_expansion)' then
    return jsonb_build_object(
      'mapped',true,'domain','Product','decisionDimension','timing','semantics','observed','priorityWeight',0.7,
      'financialImplication','Mudança de produto/infraestrutura pode preceder nova escala, carteira, recebíveis ou consumo de capital.',
      'patternHint','Product expansion','structureHint',null,
      'validationQuestion','A mudança gera crédito, recebíveis, capex ou capital de giro adicional e em que escala?',
      'nextAction','Validar mudança material em fonte primária e conectar a impacto financeiro mensurável.',
      'guardrail','Atividade técnica ou mudança de site é timing/corroboration; snapshot estático não prova necessidade de capital.'
    );
  end if;

  if s ~ '(partner_ecosystem)' then
    return jsonb_build_object(
      'mapped',true,'domain','Ecosystem','decisionDimension','context','semantics','observed','priorityWeight',0.4,
      'financialImplication','Parcerias podem ampliar distribuição/volume, mas o impacto em capital depende do modelo e economics.',
      'patternHint','Expansion','structureHint',null,
      'validationQuestion','A parceria gera volume, carteira, recebíveis ou obrigação de funding material?',
      'nextAction','Mapear economics, volume esperado e impacto sobre capital/recebíveis.',
      'guardrail','Parceria isolada é corroborante e não deve gerar necessidade de capital.'
    );
  end if;

  if s ~ '(macro|market_signal|cross_market|market_education|agricultural_timing)' then
    return jsonb_build_object(
      'mapped',true,'domain','Market Context','decisionDimension','context','semantics','contextual','priorityWeight',0.2,
      'financialImplication','Contexto setorial/macro pode alterar custo, disponibilidade e timing de execução, sem determinar necessidade company-level.',
      'patternHint',null,'structureHint',null,
      'validationQuestion','Qual fato específico da companhia conecta esse contexto a ativos, passivos, funding ou execução?',
      'nextAction','Usar para pricing/comparáveis após confirmar necessidade e estrutura específicas da companhia.',
      'guardrail','Contexto de mercado ou macro nunca deve criar funding need sozinho nem dominar o score.'
    );
  end if;

  return jsonb_build_object(
    'mapped',false,'domain','Unmapped','decisionDimension','context','semantics','contextual','priorityWeight',0.0,
    'financialImplication','Sinal ainda não possui semântica de originação governada.',
    'patternHint',null,'structureHint',null,
    'validationQuestion','Qual é a implicação financeira específica deste sinal?',
    'nextAction','Revisar o sinal e cadastrar semântica antes de usá-lo em decisão.',
    'guardrail','Sinal não mapeado não pode alterar tese, score, estrutura ou prioridade.'
  );
end;
$$;

comment on function public.origination_signal_reasoning_v2(text) is
  'Score-neutral semantic mapper for company signals: fact -> financial implication -> pattern/structure -> validation -> next action + guardrail.';

create or replace view public.origination_reasoning_coverage_v2
with (security_invoker=true)
as
with counts as (
  select signal_type,count(*)::bigint signal_count,max(created_at) last_seen
  from public.company_signals
  where signal_type<>'origination_brief'
  group by signal_type
)
select
  c.signal_type,c.signal_count,c.last_seen,
  coalesce((public.origination_signal_reasoning_v2(c.signal_type)->>'mapped')::boolean,false) mapped,
  public.origination_signal_reasoning_v2(c.signal_type)->>'domain' reasoning_domain,
  public.origination_signal_reasoning_v2(c.signal_type)->>'decisionDimension' decision_dimension,
  public.origination_signal_reasoning_v2(c.signal_type)->>'semantics' semantics,
  public.origination_signal_reasoning_v2(c.signal_type)->>'guardrail' guardrail
from counts c
order by mapped asc,c.signal_count desc,c.signal_type;

grant select on public.origination_reasoning_coverage_v2 to authenticated,service_role;

do $$
declare v_unmapped text;
begin
  select string_agg(signal_type,', ' order by signal_type) into v_unmapped
  from public.origination_reasoning_coverage_v2 where not mapped;
  if v_unmapped is not null then
    raise exception 'Universal Origination Reasoning v2 has unmapped live signal types: %',v_unmapped;
  end if;
end;
$$;

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
    m.j->>'decisionDimension' decision_dimension,
    case
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
      * coalesce((m.j->>'priorityWeight')::numeric,0)
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
    coalesce(c.hypothesis,c.description) financial_implication,
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
  from public.company_factor_observations f
  join public.origination_factor_catalog c on c.id=f.factor_id and c.active
  where coalesce(f.expires_at,now()+interval '1 day')>now()
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
    max(strength) filter(where decision_dimension='risk') top_risk_strength,
    (array_agg(distinct validation_question))[1:6] validation_questions
  from public.company_origination_reasoning_evidence_v2
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
  coalesce(st.validation_questions,array[]::text[]) validation_questions,
  coalesce(cv.total_signals,0) total_signals,coalesce(cv.mapped_signals,0) mapped_signals,
  case when coalesce(cv.total_signals,0)=0 then 100
       else round((coalesce(cv.mapped_signals,0)::numeric/cv.total_signals)*100,1) end reasoning_coverage_pct,
  coalesce(cv.unmapped_signal_types,array[]::text[]) unmapped_signal_types
from public.companies c
left join packed p on p.company_id=c.id
left join stats st on st.company_id=c.id
left join coverage cv on cv.company_id=c.id;

grant select on public.company_origination_reasoning_v2 to authenticated,service_role;

create or replace view public.company_origination_brief_v2
with (security_invoker=true)
as
select
  b.*,
  r.reasoning_dimensions,r.reasoning_dimension_count,r.reasoning_confidence,r.reasoning_evidence_count,
  r.observed_evidence_count,r.inferred_evidence_count,r.contextual_evidence_count,
  r.reasoning_coverage_pct,r.unmapped_signal_types,
  concat_ws(' ',nullif(b.why_credit,''),case when nullif(r.top_structural_implication,'') is not null then format('Leitura financeira adicional: %s',r.top_structural_implication) end) why_credit_v2,
  concat_ws(' ',nullif(b.why_now,''),case when nullif(r.top_timing_fact,'') is not null then format('Trigger/timing: %s',left(r.top_timing_fact,650)) end,case when nullif(r.top_timing_implication,'') is not null then format('Implicação: %s',r.top_timing_implication) end) why_now_v2,
  case when b.probable_pattern='Monitorar convergência entre crescimento, funding e executabilidade' and nullif(r.top_pattern_hint,'') is not null then r.top_pattern_hint else b.probable_pattern end probable_pattern_v2,
  case when b.suggested_structure='Estrutura a validar' and nullif(r.top_structure_hint,'') is not null then r.top_structure_hint else b.suggested_structure end suggested_structure_v2,
  concat_ws(' ',nullif(r.top_structural_implication,''),nullif(r.top_execution_implication,''),case when nullif(b.commercial_angle,'') is not null then format('Ângulo comercial: %s',b.commercial_angle) end) commercial_angle_v2,
  case when coalesce(r.top_risk_strength,0)>=80 and nullif(r.top_risk_next_action,'') is not null then r.top_risk_next_action else coalesce(nullif(r.top_next_action,''),b.next_action) end next_action_v2,
  case when nullif(r.top_risk_fact,'') is not null then concat_ws(' ',format('Risco: %s',left(r.top_risk_fact,700)),nullif(r.top_risk_guardrail,'')) end risks_to_validate,
  nullif(array_to_string(r.validation_questions,' | '),'') missing_evidence
from public.company_origination_brief_v1 b
left join public.company_origination_reasoning_v2 r on r.company_id=b.company_id;

grant select on public.company_origination_brief_v2 to authenticated,service_role;

create or replace function public.refresh_company_origination_brief_v1(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare b public.company_origination_brief_v2%rowtype; v_note text;
begin
  if p_company_id is null then return; end if;

  delete from public.company_signals
  where company_id=p_company_id and signal_type='origination_brief';

  if not public.is_company_origination_brief_eligible_v1(p_company_id) then return; end if;

  select * into b from public.company_origination_brief_v2 where company_id=p_company_id;
  if b.company_id is null then return; end if;

  v_note:=concat_ws(' ',
    case when nullif(b.why_credit_v2,'') is not null then format('Por que crédito: %s',b.why_credit_v2) end,
    case when nullif(b.why_now_v2,'') is not null then format('Por que agora: %s',b.why_now_v2) end,
    format('Padrão provável: %s.',b.probable_pattern_v2),
    format('Estrutura sugerida: %s.',b.suggested_structure_v2),
    case when nullif(b.risks_to_validate,'') is not null then format('Riscos/condicionantes: %s',b.risks_to_validate) end,
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
      'missingEvidence',b.missing_evidence,'nextAction',b.next_action_v2,
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

create or replace function public.trg_refresh_company_origination_brief_v1()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_company_id uuid;
  v_signal_type text;
  v_mapped boolean;
  v_dimension text;
begin
  if tg_op='DELETE' then v_company_id:=old.company_id; else v_company_id:=new.company_id; end if;

  if tg_table_name='company_signals' then
    v_signal_type:=case when tg_op='DELETE' then old.signal_type else new.signal_type end;
    if v_signal_type='origination_brief' then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;

    v_mapped:=coalesce((public.origination_signal_reasoning_v2(v_signal_type)->>'mapped')::boolean,false);
    v_dimension:=public.origination_signal_reasoning_v2(v_signal_type)->>'decisionDimension';
    if not v_mapped or v_dimension='context' then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  end if;

  perform public.refresh_company_origination_brief_v1(v_company_id);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.trg_refresh_company_origination_brief_v1() from public;

-- Existing qualification/pattern/job/metric/investor triggers from v1 now use the v2 refresh automatically.
-- Same-name signal trigger already points at trg_refresh_company_origination_brief_v1 and therefore becomes universal.

create or replace function public.trg_refresh_company_origination_brief_from_company_v2()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.refresh_company_origination_brief_v1(new.id);
  return new;
end;
$$;

revoke all on function public.trg_refresh_company_origination_brief_from_company_v2() from public;

drop trigger if exists trg_origination_brief_from_company_v2 on public.companies;
create trigger trg_origination_brief_from_company_v2
after insert or update of credit_product,has_receivables,has_fidc,has_structured_debt,funding_gap,fit_fidc,fit_dcm,current_funding_structure,metadata
on public.companies
for each row execute function public.trg_refresh_company_origination_brief_from_company_v2();

create or replace function public.enrich_lead_score_with_origination_brief_v1()
returns trigger
language plpgsql
set search_path=public
as $$
declare b public.company_origination_brief_v2%rowtype;
begin
  select * into b from public.company_origination_brief_v2 where company_id=new.company_id;
  if b.company_id is null then return new; end if;

  -- Score-neutral by design: DO NOT modify new.lead_score.
  new.next_action:=coalesce(nullif(b.next_action_v2,''),new.next_action);
  new.commercial_angle:=coalesce(nullif(b.commercial_angle_v2,''),new.commercial_angle);
  new.suggested_structure:=coalesce(nullif(b.suggested_structure_v2,''),new.suggested_structure);
  new.rationale:=concat_ws(' ',nullif(new.rationale,''),
    format('Universal Origination Reasoning v2: conviction %s/100; coverage %s%%; padrão %s.',
      b.origination_conviction_score,b.reasoning_coverage_pct,b.probable_pattern_v2));
  return new;
end;
$$;

revoke all on function public.enrich_lead_score_with_origination_brief_v1() from public;

-- Re-materialize only real/non-synthetic Company Master rows.
do $$
declare r record;
begin
  for r in select id from public.companies where public.is_company_origination_brief_eligible_v1(id) loop
    perform public.refresh_company_origination_brief_v1(r.id);
  end loop;
end;
$$;
