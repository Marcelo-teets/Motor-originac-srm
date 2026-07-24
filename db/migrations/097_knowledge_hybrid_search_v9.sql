-- Knowledge Vault V9: authenticated institutional hybrid search.
-- Reuses the official vector_documents corpus and never generates synthetic vectors.

create or replace function public.knowledge_hybrid_search(
  p_query_text text,
  p_query_embedding extensions.vector(1024) default null,
  p_company_id uuid default null,
  p_match_count integer default 12,
  p_rrf_k integer default 60
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_query text := btrim(coalesce(p_query_text, ''));
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if length(normalized_query) < 2 or length(normalized_query) > 500 then
    raise exception 'Query must contain between 2 and 500 characters';
  end if;

  if p_match_count < 1 or p_match_count > 30 then
    raise exception 'p_match_count must be between 1 and 30';
  end if;

  if p_rrf_k < 10 or p_rrf_k > 200 then
    raise exception 'p_rrf_k must be between 10 and 200';
  end if;

  with q as (
    select public.build_pt_search_query(normalized_query) as tsq
  ), lexical_candidates as (
    select
      vd.id,
      vd.company_id,
      vd.content,
      vd.metadata,
      ts_rank(vd.content_tsv, q.tsq)::double precision as lexical_score,
      row_number() over (
        order by ts_rank(vd.content_tsv, q.tsq) desc, vd.created_at desc, vd.id
      )::integer as lexical_rank
    from public.vector_documents vd
    cross join q
    where q.tsq is not null
      and vd.content_tsv @@ q.tsq
      and (p_company_id is null or vd.company_id = p_company_id::text)
    order by lexical_score desc, vd.created_at desc, vd.id
    limit p_match_count * 6
  ), semantic_candidates as (
    select
      vd.id,
      vd.company_id,
      vd.content,
      vd.metadata,
      (1 - (vd.embedding <=> p_query_embedding))::double precision as semantic_similarity,
      row_number() over (
        order by vd.embedding <=> p_query_embedding, vd.created_at desc, vd.id
      )::integer as semantic_rank
    from public.vector_documents vd
    where p_query_embedding is not null
      and vd.embedding is not null
      and (p_company_id is null or vd.company_id = p_company_id::text)
    order by vd.embedding <=> p_query_embedding, vd.created_at desc, vd.id
    limit p_match_count * 6
  ), fused as (
    select
      coalesce(l.id, s.id) as id,
      coalesce(l.company_id, s.company_id) as company_id,
      coalesce(l.content, s.content) as content,
      coalesce(l.metadata, s.metadata, '{}'::jsonb) as metadata,
      l.lexical_score,
      l.lexical_rank,
      s.semantic_similarity,
      s.semantic_rank,
      (
        coalesce(1.0 / (p_rrf_k + l.lexical_rank), 0.0)
        + coalesce(1.0 / (p_rrf_k + s.semantic_rank), 0.0)
      )::double precision as rrf_score
    from lexical_candidates l
    full outer join semantic_candidates s on s.id = l.id
  ), ranked as (
    select
      f.*,
      coalesce(c.trade_name, c.legal_name) as company_name
    from fused f
    left join public.companies c on c.id::text = f.company_id
    order by f.rrf_score desc, f.semantic_similarity desc nulls last, f.lexical_score desc nulls last, f.id
    limit p_match_count
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'query', normalized_query,
    'mode', case when p_query_embedding is null then 'lexical' else 'hybrid' end,
    'semanticAvailable', p_query_embedding is not null,
    'companyId', p_company_id,
    'matchCount', p_match_count,
    'corpus', jsonb_build_object(
      'documents', (
        select count(*)::integer
        from public.vector_documents vd
        where p_company_id is null or vd.company_id = p_company_id::text
      ),
      'embeddedDocuments', (
        select count(*)::integer
        from public.vector_documents vd
        where vd.embedding is not null
          and (p_company_id is null or vd.company_id = p_company_id::text)
      )
    ),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'companyId', nullif(r.company_id, ''),
        'companyName', r.company_name,
        'content', r.content,
        'sourceTable', coalesce(r.metadata->>'source_table', r.metadata->>'sourceTable', 'unknown'),
        'sourceId', coalesce(r.metadata->>'source_id', r.metadata->>'sourceId'),
        'sourceCatalogId', coalesce(r.metadata->>'source_catalog_id', r.metadata->>'sourceCatalogId'),
        'signalType', coalesce(r.metadata->>'signal_type', r.metadata->>'signalType'),
        'observedVsInferred', coalesce(r.metadata->>'observed_vs_inferred', r.metadata->>'observedVsInferred'),
        'confidenceScore', coalesce(
          nullif(r.metadata->>'confidence_score', '')::numeric,
          nullif(r.metadata->>'confidenceScore', '')::numeric
        ),
        'sourceCreatedAt', coalesce(r.metadata->>'source_created_at', r.metadata->>'sourceCreatedAt'),
        'lexicalScore', r.lexical_score,
        'lexicalRank', r.lexical_rank,
        'semanticSimilarity', r.semantic_similarity,
        'semanticRank', r.semantic_rank,
        'rrfScore', r.rrf_score,
        'lineage', jsonb_build_object(
          'vectorDocumentId', r.id,
          'sourceTable', coalesce(r.metadata->>'source_table', r.metadata->>'sourceTable', 'unknown'),
          'sourceId', coalesce(r.metadata->>'source_id', r.metadata->>'sourceId'),
          'companyId', nullif(r.company_id, '')
        )
      ) order by r.rrf_score desc, r.semantic_similarity desc nulls last, r.lexical_score desc nulls last)
      from ranked r
    ), '[]'::jsonb),
    'caveat', 'Busca observacional para recuperação de evidência. Relevância não altera lead score, qualification, patterns, ranking, pipeline ou decisão de crédito.'
  ) into result;

  return result;
end;
$$;

comment on function public.knowledge_hybrid_search(text, extensions.vector, uuid, integer, integer)
is 'Authenticated RRF search over vector_documents. Uses lexical-only mode when no real query embedding is supplied and never fabricates vectors.';

revoke all on function public.knowledge_hybrid_search(text, extensions.vector, uuid, integer, integer) from public, anon;
grant execute on function public.knowledge_hybrid_search(text, extensions.vector, uuid, integer, integer) to authenticated, service_role;

-- Existing retrieval helpers expose institutional corpus content and must not be callable anonymously.
revoke all on function public.match_vector_documents(extensions.vector, integer) from public, anon;
revoke all on function public.match_vector_documents_hybrid(text, extensions.vector, integer, integer, text) from public, anon;
revoke all on function public.match_vector_documents_lexical(text, integer, text) from public, anon;
grant execute on function public.match_vector_documents(extensions.vector, integer) to authenticated, service_role;
grant execute on function public.match_vector_documents_hybrid(text, extensions.vector, integer, integer, text) to authenticated, service_role;
grant execute on function public.match_vector_documents_lexical(text, integer, text) to authenticated, service_role;
