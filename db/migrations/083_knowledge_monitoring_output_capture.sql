-- Knowledge Vault V4: capture monitoring outputs as traceable source observations.
-- Observation is preserved separately from signal interpretation and score impact.

create or replace function public.knowledge_company_workspace(p_company_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.trade_name, c.legal_name),
      'cnpj', c.cnpj,
      'stage', c.stage
    ),
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', node.id,
        'title', node.title,
        'slug', node.slug,
        'nodeType', node.node_type,
        'excerpt', node.excerpt,
        'tags', to_jsonb(node.tags),
        'properties', node.properties,
        'companyId', node.company_id,
        'companyName', coalesce(c.trade_name, c.legal_name),
        'visibility', node.visibility,
        'createdBy', node.created_by,
        'updatedBy', node.updated_by,
        'createdAt', node.created_at,
        'updatedAt', node.updated_at,
        'backlinkCount', node.backlink_count,
        'outboundCount', node.outbound_count,
        'referenceCount', node.reference_count
      ) order by node.updated_at desc)
      from (
        select
          n.*,
          (select count(*) from public.knowledge_links incoming where incoming.target_node_id = n.id) as backlink_count,
          (select count(*) from public.knowledge_links outgoing where outgoing.source_node_id = n.id) as outbound_count,
          (select count(*) from public.knowledge_references reference where reference.node_id = n.id) as reference_count
        from public.knowledge_nodes n
        where n.company_id = c.id
          and n.status = 'active'
        order by n.updated_at desc
        limit 40
      ) node
    ), '[]'::jsonb),
    'latestQualification', (
      select jsonb_build_object(
        'id', q.id,
        'totalScore', coalesce(q.qualification_score_total, q.total_score),
        'fundingNeedScore', q.predicted_funding_need_score,
        'urgencyScore', coalesce(q.urgency_score, q.timing_score),
        'sourceConfidenceScore', coalesce(q.source_confidence_score, q.confidence_score),
        'suggestedStructure', q.suggested_structure_type,
        'capitalStructureRationale', coalesce(q.capital_structure_rationale, q.rationale_summary, q.rationale),
        'fundingGapLevel', q.funding_gap_level,
        'fitFidc', q.fit_fidc,
        'fitDcm', q.fit_dcm,
        'nextAction', q.next_action,
        'createdAt', q.created_at
      )
      from public.qualification_snapshots q
      where q.company_id = c.id
      order by q.created_at desc
      limit 1
    ),
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', signal.id,
        'type', signal.signal_type,
        'label', signal.signal_label,
        'strength', signal.strength,
        'confidence', signal.confidence,
        'isExplicit', signal.is_explicit,
        'evidenceText', signal.evidence_text,
        'evidenceUrl', signal.evidence_url,
        'observedAt', signal.observed_at,
        'capturedNodeId', signal.captured_node_id
      ) order by signal.observed_at desc, signal.strength desc)
      from (
        select
          s.*,
          (
            select r.node_id
            from public.knowledge_references r
            join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
            where r.reference_type = 'company_signal'
              and r.reference_id = s.id
            order by r.created_at desc
            limit 1
          ) as captured_node_id
        from public.company_signals s
        where s.company_id = c.id
        order by s.observed_at desc, s.strength desc
        limit 10
      ) signal
    ), '[]'::jsonb),
    'monitoringOutputs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', output.id,
        'title', output.title,
        'summary', output.summary,
        'url', output.url,
        'outputType', output.output_type,
        'confidenceScore', coalesce(output.confidence_score, output.source_confidence),
        'connectorStatus', output.connector_status,
        'status', output.status,
        'observedVsInferred', output.observed_vs_inferred,
        'sourceName', output.source_name,
        'observedAt', output.observed_at,
        'capturedNodeId', output.captured_node_id
      ) order by output.observed_at desc)
      from (
        select
          m.*,
          source.name as source_name,
          (
            select r.node_id
            from public.knowledge_references r
            join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
            where r.reference_type = 'monitoring_output'
              and r.reference_id = m.id
            order by r.created_at desc
            limit 1
          ) as captured_node_id
        from public.monitoring_outputs m
        left join public.source_catalog source on source.id = m.source_id
        where m.company_id = c.id
        order by m.observed_at desc
        limit 8
      ) output
    ), '[]'::jsonb),
    'pipeline', (
      select jsonb_build_object(
        'id', p.id,
        'stage', p.stage,
        'status', p.status,
        'priority', p.priority,
        'nextAction', p.next_action,
        'nextActionDueAt', p.next_action_due_at,
        'expectedStructure', p.expected_structure,
        'expectedTicket', p.expected_ticket,
        'updatedAt', p.updated_at
      )
      from public.pipeline p
      where p.company_id = c.id
      order by p.updated_at desc
      limit 1
    )
  )
  from public.companies c
  where c.id = p_company_id;
$$;

create or replace function public.knowledge_capture_monitoring_output_note(
  p_monitoring_output_id uuid,
  p_visibility text default 'team'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  output_row public.monitoring_outputs%rowtype;
  company_name text;
  source_name text;
  existing_node_id uuid;
  saved jsonb;
  saved_id uuid;
  content text;
  confidence_percent numeric;
  effective_title text;
  effective_summary text;
  source_label text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('knowledge:monitoring-output:' || p_monitoring_output_id::text, 0));

  if p_visibility not in ('team', 'private') then
    raise exception 'Invalid visibility: %', p_visibility;
  end if;

  select * into output_row
  from public.monitoring_outputs
  where id = p_monitoring_output_id
    and company_id is not null;

  if not found then
    raise exception 'Monitoring output not found or not linked to a company: %', p_monitoring_output_id;
  end if;

  select
    coalesce(c.trade_name, c.legal_name),
    source.name
  into company_name, source_name
  from public.companies c
  left join public.source_catalog source on source.id = output_row.source_id
  where c.id = output_row.company_id;

  select r.node_id into existing_node_id
  from public.knowledge_references r
  join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
  where r.reference_type = 'monitoring_output'
    and r.reference_id = p_monitoring_output_id
  order by r.created_at desc
  limit 1;

  if existing_node_id is not null then
    return public.knowledge_get_node(existing_node_id);
  end if;

  confidence_percent := case
    when coalesce(output_row.confidence_score, output_row.source_confidence, 0) <= 1
      then coalesce(output_row.confidence_score, output_row.source_confidence, 0) * 100
    else coalesce(output_row.confidence_score, output_row.source_confidence, 0)
  end;

  effective_title := left(coalesce(
    nullif(btrim(output_row.title), ''),
    nullif(btrim(source_name), ''),
    replace(output_row.output_type, '_', ' '),
    'Monitoring output'
  ), 140);

  effective_summary := left(regexp_replace(coalesce(
    nullif(btrim(output_row.summary), ''),
    nullif(btrim(output_row.raw_text), ''),
    'Sem resumo textual disponível; revisar a origem e o payload tratado antes de interpretar.'
  ), E'\\s+', ' ', 'g'), 1200);

  source_label := coalesce(nullif(btrim(source_name), ''), output_row.source_id::text, 'Fonte não identificada');

  content := format(
    E'# Evidência monitorada\n\n## Observação preservada\n%s\n\n## Origem rastreável\n- Fonte: %s\n- Tipo de output: `%s`\n- Status do dado: `%s`\n- Status do conector: `%s`\n- Confiança: %s%%\n- Natureza: `%s`\n- Observado em: %s\n%s\n\n## Limite analítico\nEste registro preserva uma observação de fonte. Ele não constitui, isoladamente, sinal confirmado, conclusão de crédito ou recomendação automática.\n\n## Perguntas para análise\n- O que efetivamente mudou na empresa?\n- Existe impacto em funding, recebíveis, capital de giro ou estrutura de capital?\n- A evidência é explícita ou exige inferência?\n- Há confirmação por outra fonte independente?\n\n## Próxima ação\nValidar a fonte primária e decidir se a observação deve gerar `company_signal`, atualizar qualification, patterns, ranking ou abordagem comercial.',
    effective_summary,
    source_label,
    output_row.output_type,
    output_row.status,
    output_row.connector_status,
    round(confidence_percent, 0),
    output_row.observed_vs_inferred,
    to_char(output_row.observed_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    case when output_row.url is not null then E'- URL: ' || output_row.url else '' end
  );

  saved := public.knowledge_save_node(
    null,
    format('Evidência monitorada — %s — %s', company_name, effective_title),
    'source',
    content,
    array_remove(array[
      'monitoring',
      'evidence',
      lower(replace(output_row.output_type, '_', '-')),
      lower(replace(output_row.connector_status, '_', '-')),
      lower(replace(output_row.observed_vs_inferred, '_', '-'))
    ], ''),
    jsonb_build_object(
      'origin', 'monitoring_output',
      'monitoringOutputId', output_row.id,
      'sourceId', output_row.source_id,
      'sourceName', source_name,
      'capturedFromLiveData', true,
      'observationOnly', true
    ),
    output_row.company_id,
    p_visibility
  );

  saved_id := (saved->'node'->>'id')::uuid;

  insert into public.knowledge_references (
    node_id, company_id, reference_type, reference_id, label, snapshot, created_by
  ) values (
    saved_id,
    output_row.company_id,
    'monitoring_output',
    output_row.id,
    effective_title,
    jsonb_build_object(
      'sourceId', output_row.source_id,
      'sourceName', source_name,
      'outputType', output_row.output_type,
      'title', output_row.title,
      'summary', output_row.summary,
      'url', output_row.url,
      'status', output_row.status,
      'connectorStatus', output_row.connector_status,
      'confidenceScore', coalesce(output_row.confidence_score, output_row.source_confidence),
      'observedVsInferred', output_row.observed_vs_inferred,
      'observedAt', output_row.observed_at
    ),
    auth.uid()
  ) on conflict (node_id, reference_type, reference_id) do nothing;

  return public.knowledge_get_node(saved_id);
end;
$$;

grant execute on function public.knowledge_capture_monitoring_output_note(uuid, text) to authenticated, service_role;
revoke all on function public.knowledge_capture_monitoring_output_note(uuid, text) from public, anon;
