-- Knowledge Learning Agent V14: disambiguate PL/pgSQL variables from knowledge_links columns.
create or replace function public.knowledge_agent_sync_links(p_run_id uuid, p_company_id uuid, p_links jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  system_actor constant uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  link_item jsonb;
  source_id uuid;
  target_id uuid;
  v_target_title text;
  v_target_slug text;
  v_relation_type text;
  applied integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists (select 1 from public.knowledge_learning_runs where id = p_run_id and company_id = p_company_id and status = 'processing') then raise exception 'Learning run not active'; end if;

  delete from public.knowledge_links l
  using public.knowledge_nodes source
  where l.source_node_id = source.id
    and source.company_id = p_company_id
    and l.properties->>'managedBy' = 'knowledge-learning-agent-v1';

  for link_item in select value from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
    v_relation_type := coalesce(link_item->>'relationType', 'related');
    if v_relation_type not in ('supports', 'challenges', 'related', 'evidence', 'thesis', 'signal') then v_relation_type := 'related'; end if;

    select id into source_id
    from public.knowledge_nodes
    where company_id = p_company_id and status = 'active'
      and properties->>'managedBy' = 'knowledge-learning-agent-v1'
      and properties->>'agentKey' = link_item->>'fromKey'
    order by updated_at desc limit 1;

    select id, title, slug into target_id, v_target_title, v_target_slug
    from public.knowledge_nodes
    where company_id = p_company_id and status = 'active'
      and properties->>'managedBy' = 'knowledge-learning-agent-v1'
      and properties->>'agentKey' = link_item->>'toKey'
    order by updated_at desc limit 1;

    if source_id is null or target_id is null or source_id = target_id then continue; end if;

    insert into public.knowledge_links (
      source_node_id, target_node_id, target_title, target_slug, relation_type, properties, created_by
    ) values (
      source_id, target_id, v_target_title, v_target_slug, v_relation_type,
      jsonb_build_object(
        'managedBy', 'knowledge-learning-agent-v1',
        'learningRunId', p_run_id,
        'companyId', p_company_id,
        'confidence', greatest(0, least(1, case
          when coalesce(link_item->>'confidence', '') ~ '^-?[0-9]+(?:\.[0-9]+)?$'
            then (link_item->>'confidence')::numeric
          else 0
        end)),
        'rationale', left(coalesce(link_item->>'rationale', ''), 1000)
      ),
      system_actor
    ) on conflict (source_node_id, target_slug, relation_type) do update set
      target_node_id = excluded.target_node_id,
      target_title = excluded.target_title,
      properties = excluded.properties;
    applied := applied + 1;
  end loop;

  return jsonb_build_object('linksApplied', applied);
end;
$$;

revoke all on function public.knowledge_agent_sync_links(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.knowledge_agent_sync_links(uuid, uuid, jsonb) to service_role;
