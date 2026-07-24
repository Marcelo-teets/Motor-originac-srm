-- pgvector does not define vector equality; compare canonical text only to detect unchanged embeddings.

create or replace function public.knowledge_invalidate_stale_embedding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.content is distinct from old.content
     and coalesce(new.embedding::text, '') = coalesce(old.embedding::text, '') then
    new.embedding := null;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      - 'embedding_model'
      - 'embedding_dimensions'
      - 'embedding_content_sha256'
      - 'embedded_at'
      - 'embedding_provider_request_id';
  end if;

  return new;
end;
$$;
