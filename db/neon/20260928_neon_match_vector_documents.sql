-- Neon-compatible deferred vector search function.
-- 1024 dims: same Voyage embeddings as vector_documents (098 / knowledge-embedding-worker).
create or replace function public.match_vector_documents(
  query_embedding vector(1024),
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
