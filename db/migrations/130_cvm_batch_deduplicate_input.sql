-- Prevent PostgreSQL SQLSTATE 21000 when one CVM batch contains repeated
-- constrained keys. The original atomic persistence function remains the
-- single writer; this wrapper only canonicalizes the JSON input first.

do $$
begin
  if to_regprocedure('public.persist_capital_market_batch_v1(jsonb)') is null then
    if to_regprocedure('public.persist_capital_market_batch(jsonb)') is null then
      raise exception 'persist_capital_market_batch(jsonb) must exist before migration 130';
    end if;

    alter function public.persist_capital_market_batch(jsonb)
      rename to persist_capital_market_batch_v1;
  end if;
end
$$;

create or replace function public.persist_capital_market_batch(p_records jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_original_count integer;
  v_deduplicated_records jsonb;
  v_deduplicated_count integer;
  v_result jsonb;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records must be a JSON array';
  end if;

  v_original_count := jsonb_array_length(p_records);

  if exists (
    select 1
    from jsonb_array_elements(p_records) item
    where nullif(item -> 'event' ->> 'dataset_code', '') is null
       or nullif(item -> 'event' ->> 'record_key', '') is null
  ) then
    raise exception 'every capital-market record must contain event.dataset_code and event.record_key';
  end if;

  with input_records as (
    select
      item,
      ordinality::bigint as input_order,
      item -> 'event' ->> 'dataset_code' as dataset_code,
      item -> 'event' ->> 'record_key' as record_key
    from jsonb_array_elements(p_records) with ordinality as input(item, ordinality)
  ),
  top_level_deduplicated as (
    select distinct on (dataset_code, record_key)
      item,
      input_order
    from input_records
    order by dataset_code, record_key, input_order desc
  ),
  normalized_records as (
    select
      jsonb_set(
        jsonb_set(
          item,
          '{entity_links}',
          coalesce((
            select jsonb_agg(link order by link_order)
            from (
              select distinct on (
                link ->> 'dataset_code',
                link ->> 'record_key',
                link ->> 'entity_role',
                link ->> 'entity_key'
              )
                link,
                link_order
              from jsonb_array_elements(coalesce(item -> 'entity_links', '[]'::jsonb))
                with ordinality as links(link, link_order)
              order by
                link ->> 'dataset_code',
                link ->> 'record_key',
                link ->> 'entity_role',
                link ->> 'entity_key',
                link_order desc
            ) unique_links
          ), '[]'::jsonb),
          true
        ),
        '{metrics}',
        coalesce((
          select jsonb_agg(metric order by metric_order)
          from (
            select distinct on (
              metric ->> 'dataset_code',
              metric ->> 'record_key',
              metric ->> 'metric_code',
              metric ->> 'source_column'
            )
              metric,
              metric_order
            from jsonb_array_elements(coalesce(item -> 'metrics', '[]'::jsonb))
              with ordinality as metrics(metric, metric_order)
            order by
              metric ->> 'dataset_code',
              metric ->> 'record_key',
              metric ->> 'metric_code',
              metric ->> 'source_column',
              metric_order desc
          ) unique_metrics
        ), '[]'::jsonb),
        true
      ) as item,
      input_order
    from top_level_deduplicated
  )
  select coalesce(jsonb_agg(item order by input_order), '[]'::jsonb)
  into v_deduplicated_records
  from normalized_records;

  v_deduplicated_count := jsonb_array_length(v_deduplicated_records);
  v_result := public.persist_capital_market_batch_v1(v_deduplicated_records);

  return v_result || jsonb_build_object(
    'recordsReceived', v_original_count,
    'recordsAfterDeduplication', v_deduplicated_count,
    'recordsDeduplicated', v_original_count - v_deduplicated_count
  );
end;
$$;

revoke all on function public.persist_capital_market_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.persist_capital_market_batch(jsonb)
  to service_role;

comment on function public.persist_capital_market_batch(jsonb) is
  'Deduplicates CVM batch keys and delegates to the atomic v1 persistence function, preventing SQLSTATE 21000 while preserving idempotency.';
