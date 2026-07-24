-- V10 security hardening: keep trigger executors private and isolate the definer-only aggregate.

create schema if not exists private;
revoke all on schema private from public, anon;

create or replace function private.knowledge_embedding_coverage_internal()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, extensions, pg_temp
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'generatedAt', now(),
    'modelContract', jsonb_build_object(
      'provider', 'Voyage AI',
      'model', 'voyage-3.5',
      'dimensions', 1024,
      'syntheticEmbeddingsAllowed', false
    ),
    'documents', jsonb_build_object(
      'total', count(*)::integer,
      'embedded', count(*) filter (where vd.embedding is not null)::integer,
      'pending', count(*) filter (where vd.embedding is null)::integer,
      'coveragePct', round(
        case when count(*) = 0 then 0 else 100.0 * count(*) filter (where vd.embedding is not null) / count(*) end,
        2
      )
    ),
    'jobs', (
      select jsonb_build_object(
        'total', count(*)::integer,
        'pending', count(*) filter (where status = 'pending')::integer,
        'processing', count(*) filter (where status = 'processing')::integer,
        'completed', count(*) filter (where status = 'completed')::integer,
        'dead', count(*) filter (where status = 'dead')::integer,
        'completedToday', count(*) filter (
          where status = 'completed'
            and attempts > 0
            and completed_at >= date_trunc('day', now())
        )::integer,
        'baselineEmbedded', count(*) filter (
          where status = 'completed' and attempts = 0
        )::integer,
        'oldestPendingAt', min(created_at) filter (where status = 'pending'),
        'lastCompletedAt', max(completed_at) filter (where status = 'completed' and attempts > 0)
      )
      from public.knowledge_embedding_jobs
    ),
    'bySource', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourceTable', source_table,
        'documents', documents,
        'embedded', embedded,
        'pending', pending,
        'coveragePct', coverage_pct
      ) order by pending desc, documents desc, source_table)
      from (
        select
          coalesce(vd.metadata->>'source_table', vd.metadata->>'sourceTable', 'unknown') as source_table,
          count(*)::integer as documents,
          count(*) filter (where vd.embedding is not null)::integer as embedded,
          count(*) filter (where vd.embedding is null)::integer as pending,
          round(
            case when count(*) = 0 then 0 else 100.0 * count(*) filter (where vd.embedding is not null) / count(*) end,
            2
          ) as coverage_pct
        from public.vector_documents vd
        group by 1
      ) source_coverage
    ), '[]'::jsonb),
    'caveat', 'Coverage is operational telemetry only. Embedding presence or retrieval relevance never changes qualification, patterns, lead score, ranking, pipeline or credit decisions.'
  ) into result
  from public.vector_documents vd;

  return result;
end;
$$;

create or replace function public.knowledge_embedding_coverage()
returns jsonb
language plpgsql
security invoker
stable
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  return private.knowledge_embedding_coverage_internal();
end;
$$;

-- Service-role policy is explicit for linting and defense in depth; service_role normally bypasses RLS.
drop policy if exists knowledge_embedding_jobs_service_role_all on public.knowledge_embedding_jobs;
create policy knowledge_embedding_jobs_service_role_all
on public.knowledge_embedding_jobs
for all
to service_role
using (true)
with check (true);

revoke all on function public.knowledge_queue_embedding_on_document_change() from public, anon, authenticated;
revoke all on function public.knowledge_embedding_jobs_touch_updated_at() from public, anon, authenticated;
revoke all on function public.knowledge_invalidate_stale_embedding() from public, anon, authenticated;
revoke all on function private.knowledge_embedding_coverage_internal() from public, anon;
revoke all on function public.knowledge_embedding_coverage() from public, anon;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.knowledge_embedding_coverage_internal() to authenticated, service_role;
grant execute on function public.knowledge_embedding_coverage() to authenticated, service_role;
