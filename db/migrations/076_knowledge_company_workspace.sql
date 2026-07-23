-- Knowledge Vault v2: company workspace, traceable evidence references and one-click capture.

create table if not exists public.knowledge_references (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.knowledge_nodes(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  reference_type text not null check (reference_type in (
    'company_signal', 'monitoring_output', 'qualification_snapshot', 'pipeline'
  )),
  reference_id uuid not null,
  label text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (node_id, reference_type, reference_id)
);

create index if not exists idx_knowledge_references_company
  on public.knowledge_references (company_id, created_at desc);

create index if not exists idx_knowledge_references_target
  on public.knowledge_references (reference_type, reference_id);

create or replace function public.validate_knowledge_reference()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  node_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  if new.created_by <> auth.uid() then
    raise exception 'created_by must match authenticated user';
  end if;

  select company_id
    into node_company_id
  from public.knowledge_nodes
  where id = new.node_id
    and status = 'active';

  if not found then
    raise exception 'Knowledge node not found or not visible: %', new.node_id;
  end if;

  if node_company_id is null or node_company_id is distinct from new.company_id then
    raise exception 'Knowledge reference company must match node company';
  end if;

  case new.reference_type
    when 'company_signal' then
      if not exists (
        select 1 from public.company_signals
        where id = new.reference_id and company_id = new.company_id
      ) then
        raise exception 'Company signal reference is invalid';
      end if;
    when 'monitoring_output' then
      if not exists (
        select 1 from public.monitoring_outputs
        where id = new.reference_id and company_id = new.company_id
      ) then
        raise exception 'Monitoring output reference is invalid';
      end if;
    when 'qualification_snapshot' then
      if not exists (
        select 1 from public.qualification_snapshots
        where id = new.reference_id and company_id = new.company_id
      ) then
        raise exception 'Qualification snapshot reference is invalid';
      end if;
    when 'pipeline' then
      if not exists (
        select 1 from public.pipeline
        where id = new.reference_id and company_id = new.company_id
      ) then
        raise exception 'Pipeline reference is invalid';
      end if;
    else
      raise exception 'Unsupported knowledge reference type: %', new.reference_type;
  end case;

  return new;
end;
$$;

alter table public.knowledge_references enable row level security;

drop policy if exists knowledge_references_select on public.knowledge_references;
create policy knowledge_references_select
  on public.knowledge_references
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.knowledge_nodes n
      where n.id = node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_references_insert on public.knowledge_references;
create policy knowledge_references_insert
  on public.knowledge_references
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.knowledge_nodes n
      where n.id = node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop policy if exists knowledge_references_delete on public.knowledge_references;
create policy knowledge_references_delete
  on public.knowledge_references
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.knowledge_nodes n
      where n.id = node_id
        and (n.visibility = 'team' or n.created_by = (select auth.uid()))
    )
  );

drop trigger if exists trg_validate_knowledge_reference on public.knowledge_references;
create trigger trg_validate_knowledge_reference
  before insert or update on public.knowledge_references
  for each row execute function public.validate_knowledge_reference();

create or replace function public.knowledge_get_node(p_node_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'node', (to_jsonb(n) - 'status'),
    'companyName', coalesce(c.trade_name, c.legal_name),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'targetNodeId', l.target_node_id,
        'targetTitle', l.target_title,
        'targetSlug', l.target_slug,
        'relationType', l.relation_type,
        'resolvedTitle', target.title
      ) order by l.created_at)
      from public.knowledge_links l
      left join public.knowledge_nodes target on target.id = l.target_node_id
      where l.source_node_id = n.id
    ), '[]'::jsonb),
    'backlinks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'sourceNodeId', l.source_node_id,
        'sourceTitle', source.title,
        'sourceSlug', source.slug,
        'relationType', l.relation_type
      ) order by l.created_at desc)
      from public.knowledge_links l
      join public.knowledge_nodes source on source.id = l.source_node_id
      where l.target_node_id = n.id
    ), '[]'::jsonb),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'versionNumber', v.version_number,
        'createdBy', v.created_by,
        'createdAt', v.created_at
      ) order by v.version_number desc)
      from (
        select *
        from public.knowledge_node_versions
        where node_id = n.id
        order by version_number desc
        limit 20
      ) v
    ), '[]'::jsonb),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'companyId', r.company_id,
        'referenceType', r.reference_type,
        'referenceId', r.reference_id,
        'label', r.label,
        'snapshot', r.snapshot,
        'createdBy', r.created_by,
        'createdAt', r.created_at
      ) order by r.created_at desc)
      from public.knowledge_references r
      where r.node_id = n.id
    ), '[]'::jsonb)
  )
  from public.knowledge_nodes n
  left join public.companies c on c.id = n.company_id
  where n.id = p_node_id
    and n.status = 'active';
$$;

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
        'observedAt', output.observed_at
      ) order by output.observed_at desc)
      from (
        select *
        from public.monitoring_outputs
        where company_id = c.id
        order by observed_at desc
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

  if p_visibility not in ('team', 'private') then
    raise exception 'Invalid visibility: %', p_visibility;
  end if;

  select *
    into signal_row
  from public.company_signals
  where id = p_signal_id;

  if not found then
    raise exception 'Company signal not found: %', p_signal_id;
  end if;

  select coalesce(c.trade_name, c.legal_name)
    into company_name
  from public.companies c
  where c.id = signal_row.company_id;

  select r.node_id
    into existing_node_id
  from public.knowledge_references r
  join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
  where r.reference_type = 'company_signal'
    and r.reference_id = p_signal_id
  order by r.created_at desc
  limit 1;

  if existing_node_id is not null then
    return public.knowledge_get_node(existing_node_id);
  end if;

  confidence_percent := case
    when signal_row.confidence <= 1 then signal_row.confidence * 100
    else signal_row.confidence
  end;

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
    jsonb_build_object(
      'origin', 'company_signal',
      'signalId', signal_row.id,
      'capturedFromLiveData', true
    ),
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_visibility not in ('team', 'private') then
    raise exception 'Invalid visibility: %', p_visibility;
  end if;

  select *
    into qualification_row
  from public.qualification_snapshots
  where company_id = p_company_id
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Qualification snapshot not found for company: %', p_company_id;
  end if;

  select coalesce(c.trade_name, c.legal_name)
    into company_name
  from public.companies c
  where c.id = qualification_row.company_id;

  select r.node_id
    into existing_node_id
  from public.knowledge_references r
  join public.knowledge_nodes n on n.id = r.node_id and n.status = 'active'
  where r.reference_type = 'qualification_snapshot'
    and r.reference_id = qualification_row.id
  order by r.created_at desc
  limit 1;

  if existing_node_id is not null then
    return public.knowledge_get_node(existing_node_id);
  end if;

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
    array_remove(array[
      'thesis',
      'qualification',
      lower(replace(coalesce(qualification_row.suggested_structure_type, ''), ' ', '-'))
    ], ''),
    jsonb_build_object(
      'origin', 'qualification_snapshot',
      'qualificationSnapshotId', qualification_row.id,
      'generatedFromLiveData', true
    ),
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

-- Explicit Data API grants: knowledge data is internal-only and never exposed to anon.
revoke all on table public.knowledge_nodes from anon;
revoke all on table public.knowledge_links from anon;
revoke all on table public.knowledge_node_versions from anon;
revoke all on table public.knowledge_saved_views from anon;
revoke all on table public.knowledge_references from anon;

revoke all on table public.knowledge_nodes from public;
revoke all on table public.knowledge_links from public;
revoke all on table public.knowledge_node_versions from public;
revoke all on table public.knowledge_saved_views from public;
revoke all on table public.knowledge_references from public;

grant select, insert, delete on public.knowledge_references to authenticated;
grant all on public.knowledge_references to service_role;

revoke all on function public.validate_knowledge_reference() from public, anon;
revoke all on function public.knowledge_company_workspace(uuid) from public, anon;
revoke all on function public.knowledge_capture_signal_note(uuid, text) from public, anon;
revoke all on function public.knowledge_capture_qualification_note(uuid, text) from public, anon;
revoke all on function public.knowledge_get_node(uuid) from public, anon;

grant execute on function public.knowledge_company_workspace(uuid) to authenticated, service_role;
grant execute on function public.knowledge_capture_signal_note(uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_capture_qualification_note(uuid, text) to authenticated, service_role;
grant execute on function public.knowledge_get_node(uuid) to authenticated, service_role;
