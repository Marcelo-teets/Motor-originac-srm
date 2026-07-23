-- Serialize one-click captures so concurrent requests cannot create duplicate notes.

create or replace function public.knowledge_capture_signal_note(
  p_signal_id uuid,
  p_visibility text default 'team'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  signal_row public.company_signals%rowtype;
  company_name text;
  existing_node_id uuid;
  saved jsonb;
  saved_id uuid;
  content text;
  confidence_percent numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:signal:' || p_signal_id::text, 0));

  if p_visibility not in ('team', 'private') then
    raise exception 'Invalid visibility: %', p_visibility;
  end if;

  select * into signal_row from public.company_signals where id = p_signal_id;
  if not found then raise exception 'Company signal not found: %', p_signal_id; end if;

  select coalesce(c.trade_name, c.legal_name) into company_name
  from public.companies c where c.id = signal_row.company_id;

  select r.node_id into existing_node_id
  from public.knowledge_references r
  join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
  where r.reference_type = 'company_signal' and r.reference_id = p_signal_id
  order by r.created_at desc limit 1;

  if existing_node_id is not null then return public.knowledge_get_node(existing_node_id); end if;

  confidence_percent := case when signal_row.confidence <= 1 then signal_row.confidence * 100 else signal_row.confidence end;

  content := format(
    E'# Sinal observado\n\n## O que mudou\n%s\n\n## Evidência rastreável\n- Tipo: `%s`\n- Força: %s/100\n- Confiança: %s%%\n- Natureza: %s\n- Observado em: %s\n%s\n\n## Por que importa financeiramente\nAvaliar como este evento altera necessidade de funding, geração de recebíveis, estrutura de capital, timing e capacidade de execução.\n\n## Estrutura potencial\nConfrontar o sinal com a tese vigente e validar aderência a FIDC, DCM ou outra estrutura de crédito.\n\n## Próxima ação\nValidar a evidência primária, quantificar o impacto e atualizar qualification, patterns, ranking e abordagem comercial.',
    coalesce(nullif(signal_row.evidence_text, ''), signal_row.signal_label),
    signal_row.signal_type,
    round(signal_row.strength, 0),
    round(confidence_percent, 0),
    case when signal_row.is_explicit then 'explícito' else 'implícito/inferido' end,
    to_char(signal_row.observed_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    case when signal_row.evidence_url is not null then E'- Fonte: ' || signal_row.evidence_url else '' end
  );

  saved := public.knowledge_save_node(
    null,
    format('Sinal — %s — %s', company_name, signal_row.signal_label),
    'signal',
    content,
    array['signal', lower(replace(signal_row.signal_type, '_', '-'))],
    jsonb_build_object('origin', 'company_signal', 'signalId', signal_row.id, 'capturedFromLiveData', true),
    signal_row.company_id,
    p_visibility
  );

  saved_id := (saved->'node'->>'id')::uuid;

  insert into public.knowledge_references (
    node_id, company_id, reference_type, reference_id, label, snapshot, created_by
  ) values (
    saved_id,
    signal_row.company_id,
    'company_signal',
    signal_row.id,
    signal_row.signal_label,
    jsonb_build_object(
      'signalType', signal_row.signal_type,
      'strength', signal_row.strength,
      'confidence', signal_row.confidence,
      'isExplicit', signal_row.is_explicit,
      'evidenceText', signal_row.evidence_text,
      'evidenceUrl', signal_row.evidence_url,
      'observedAt', signal_row.observed_at
    ),
    auth.uid()
  ) on conflict (node_id, reference_type, reference_id) do nothing;

  return public.knowledge_get_node(saved_id);
end;
$$;

create or replace function public.knowledge_capture_qualification_note(
  p_company_id uuid,
  p_visibility text default 'team'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  qualification_row public.qualification_snapshots%rowtype;
  company_name text;
  existing_node_id uuid;
  saved jsonb;
  saved_id uuid;
  content text;
  total_score numeric;
  urgency numeric;
  source_confidence numeric;
  rationale text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:qualification:' || p_company_id::text, 0));

  if p_visibility not in ('team', 'private') then raise exception 'Invalid visibility: %', p_visibility; end if;

  select * into qualification_row
  from public.qualification_snapshots
  where company_id = p_company_id
  order by created_at desc limit 1;
  if not found then raise exception 'Qualification snapshot not found for company: %', p_company_id; end if;

  select coalesce(c.trade_name, c.legal_name) into company_name
  from public.companies c where c.id = qualification_row.company_id;

  select r.node_id into existing_node_id
  from public.knowledge_references r
  join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
  where r.reference_type = 'qualification_snapshot' and r.reference_id = qualification_row.id
  order by r.created_at desc limit 1;

  if existing_node_id is not null then return public.knowledge_get_node(existing_node_id); end if;

  total_score := coalesce(qualification_row.qualification_score_total, qualification_row.total_score);
  urgency := coalesce(qualification_row.urgency_score, qualification_row.timing_score);
  source_confidence := coalesce(qualification_row.source_confidence_score, qualification_row.confidence_score);
  rationale := coalesce(qualification_row.capital_structure_rationale, qualification_row.rationale_summary, qualification_row.rationale, 'Rationale ainda não consolidado.');

  content := format(
    E'# Tese de crédito\n\n## Diagnóstico atual\n- Qualification score: %s/100\n- Funding need: %s/100\n- Urgência: %s/100\n- Confiança das fontes: %s\n- Funding gap: %s\n- Fit FIDC: %s\n- Fit DCM: %s\n\n## Rationale\n%s\n\n## Estrutura sugerida\n%s\n\n## Por que agora\nO snapshot mais recente indica uma combinação de necessidade estrutural, timing e executabilidade que deve ser confrontada com os sinais e evidências atuais.\n\n## Próxima ação\n%s\n\n## Diligência mínima\n- carteira e aging de recebíveis\n- concentração e inadimplência\n- estrutura atual de funding e custo\n- governança, underwriting e capacidade operacional\n- cronograma e sponsor interno da operação',
    round(coalesce(total_score, 0), 0),
    round(coalesce(qualification_row.predicted_funding_need_score, 0), 0),
    round(coalesce(urgency, 0), 0),
    round(coalesce(source_confidence, 0), 2),
    coalesce(qualification_row.funding_gap_level, case when qualification_row.funding_gap then 'identificado' else 'não confirmado' end),
    case when qualification_row.fit_fidc then 'Sim' when qualification_row.fit_fidc is false then 'Não' else 'Em avaliação' end,
    case when qualification_row.fit_dcm then 'Sim' when qualification_row.fit_dcm is false then 'Não' else 'Em avaliação' end,
    rationale,
    coalesce(qualification_row.suggested_structure_type, qualification_row.fit_other_structure, 'Estrutura em avaliação'),
    coalesce(qualification_row.next_action, 'Validar evidências e definir abordagem comercial.')
  );

  saved := public.knowledge_save_node(
    null,
    format('Tese de crédito — %s — %s', company_name, to_char(qualification_row.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')),
    'thesis',
    content,
    array_remove(array['thesis', 'qualification', lower(replace(coalesce(qualification_row.suggested_structure_type, ''), ' ', '-'))], ''),
    jsonb_build_object('origin', 'qualification_snapshot', 'qualificationSnapshotId', qualification_row.id, 'generatedFromLiveData', true),
    qualification_row.company_id,
    p_visibility
  );

  saved_id := (saved->'node'->>'id')::uuid;

  insert into public.knowledge_references (
    node_id, company_id, reference_type, reference_id, label, snapshot, created_by
  ) values (
    saved_id,
    qualification_row.company_id,
    'qualification_snapshot',
    qualification_row.id,
    'Qualification snapshot',
    jsonb_build_object(
      'totalScore', total_score,
      'fundingNeedScore', qualification_row.predicted_funding_need_score,
      'urgencyScore', urgency,
      'sourceConfidenceScore', source_confidence,
      'suggestedStructure', qualification_row.suggested_structure_type,
      'fundingGapLevel', qualification_row.funding_gap_level,
      'fitFidc', qualification_row.fit_fidc,
      'fitDcm', qualification_row.fit_dcm,
      'rationale', rationale,
      'nextAction', qualification_row.next_action,
      'createdAt', qualification_row.created_at
    ),
    auth.uid()
  ) on conflict (node_id, reference_type, reference_id) do nothing;

  return public.knowledge_get_node(saved_id);
end;
$$;
