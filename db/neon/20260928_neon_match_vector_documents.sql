-- Neon-compatible deferred vector search function.
create or replace function public.match_vector_documents(
  query_embedding vector(1536),
  match_count integer default 5
)
returns table(id uuid, content text)
language sql
as $function$
  select vd.id, vd.content
  from public.vector_documents vd
  where vd.embedding is not null
  order by vd.embedding <=> query_embedding
  limit greatest(match_count, 1);
$function$;
