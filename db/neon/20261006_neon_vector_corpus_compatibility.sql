-- Canonical Neon vector corpus compatibility for Knowledge Vault.
-- Uses the live 1024-dimensional Voyage embedding contract.

create extension if not exists vector;

create table if not exists public.vector_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  content text not null,
  embedding vector(1024),
  metadata jsonb not null default '{}'::jsonb,
  content_tsv tsvector generated always as (to_tsvector('portuguese', coalesce(content, ''))) stored,
  created_at timestamptz not null default now()
);

alter table public.vector_documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_vector_documents_company
  on public.vector_documents(company_id);

create index if not exists idx_vector_documents_content_tsv
  on public.vector_documents using gin(content_tsv);

create or replace function public.match_vector_documents(
  query_embedding vector(1024),
  match_count integer default 5
)
returns table(id uuid, content text)
language sql
stable
set search_path = public
as $$
  select vd.id, vd.content
  from public.vector_documents vd
  where vd.embedding is not null
  order by vd.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

create or replace function public.match_vector_documents_lexical(
  query_text text,
  match_count integer default 5,
  company_id text default null
)
returns table(id uuid, content text)
language sql
stable
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('portuguese', btrim(coalesce(query_text, ''))) as tsq
  )
  select vd.id, vd.content
  from public.vector_documents vd
  cross join q
  where length(btrim(coalesce(query_text, ''))) > 0
    and vd.content_tsv @@ q.tsq
    and ($3 is null or vd.company_id::text = $3)
  order by ts_rank(vd.content_tsv, q.tsq) desc, vd.created_at desc
  limit greatest(match_count, 1);
$$;

create or replace function public.match_vector_documents_hybrid(
  query_text text,
  query_embedding vector(1024),
  match_count integer default 5,
  rrf_k integer default 60,
  company_id text default null
)
returns table(id uuid, content text)
language sql
stable
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('portuguese', btrim(coalesce(query_text, ''))) as tsq
  ), lexical as (
    select vd.id, row_number() over(order by ts_rank(vd.content_tsv,q.tsq) desc,vd.created_at desc)::int as rk
    from public.vector_documents vd cross join q
    where vd.content_tsv @@ q.tsq and ($5 is null or vd.company_id::text=$5)
    limit greatest(match_count,1)*6
  ), semantic as (
    select vd.id, row_number() over(order by vd.embedding <=> query_embedding,vd.created_at desc)::int as rk
    from public.vector_documents vd
    where query_embedding is not null and vd.embedding is not null
      and ($5 is null or vd.company_id::text=$5)
    limit greatest(match_count,1)*6
  ), fused as (
    select coalesce(l.id,s.id) id,
      coalesce(1.0/(greatest(rrf_k,1)+l.rk),0)+coalesce(1.0/(greatest(rrf_k,1)+s.rk),0) score
    from lexical l full join semantic s on s.id=l.id
  )
  select vd.id,vd.content
  from fused f join public.vector_documents vd on vd.id=f.id
  order by f.score desc,vd.created_at desc
  limit greatest(match_count,1);
$$;
