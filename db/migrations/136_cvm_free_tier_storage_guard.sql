begin;

create or replace function public.persist_capital_market_batch(p_records jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
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
          jsonb_set(
            jsonb_set(
              jsonb_set(
                item,
                '{entity_links}',
                coalesce((
                  select jsonb_agg(link order by link_order)
                  from (
                    select distinct on (
                      link ->> 'dataset_code', link ->> 'record_key',
                      link ->> 'entity_role', link ->> 'entity_key'
                    ) link, link_order
                    from jsonb_array_elements(coalesce(item -> 'entity_links', '[]'::jsonb))
                      with ordinality as links(link, link_order)
                    where coalesce((link ->> 'is_primary_origination_target')::boolean, false)
                       or link ->> 'entity_role' in ('debtor', 'originator', 'assignor', 'securitizer')
                    order by
                      link ->> 'dataset_code', link ->> 'record_key',
                      link ->> 'entity_role', link ->> 'entity_key', link_order desc
                  ) unique_links
                ), '[]'::jsonb),
                true
              ),
              '{metrics}',
              coalesce((
                select jsonb_agg(metric order by metric_order)
                from (
                  select distinct on (
                    metric ->> 'dataset_code', metric ->> 'record_key',
                    metric ->> 'metric_code', metric ->> 'source_column'
                  ) metric, metric_order
                  from jsonb_array_elements(coalesce(item -> 'metrics', '[]'::jsonb))
                    with ordinality as metrics(metric, metric_order)
                  order by
                    metric ->> 'dataset_code', metric ->> 'record_key',
                    metric ->> 'metric_code', metric ->> 'source_column', metric_order desc
                ) unique_metrics
              ), '[]'::jsonb),
              true
            ),
            '{bronze,payload}',
            jsonb_build_object(
              'sourceCode', item -> 'event' ->> 'source_code',
              'sourceUrl', item -> 'event' ->> 'source_url',
              'resourceName', item -> 'event' ->> 'source_resource_name',
              'fileName', item -> 'event' ->> 'source_file_name',
              'contentHash', item -> 'event' ->> 'content_hash',
              'retentionMode', 'compact_manifest',
              'rawEvidence', 'official_source_and_cold_archive'
            ),
            true
          ),
          '{event,raw_payload}',
          '{}'::jsonb,
          true
        ),
        '{event,normalized_payload}',
        coalesce(item -> 'event' -> 'normalized_payload', '{}'::jsonb)
          || jsonb_build_object(
            'rawEvidence', jsonb_build_object(
              'mode', 'official_source_and_cold_archive',
              'sourceUrl', item -> 'event' ->> 'source_url',
              'contentHash', item -> 'event' ->> 'content_hash'
            )
          ),
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
    'recordsDeduplicated', v_original_count - v_deduplicated_count,
    'storageMode', 'free_tier_compact_hot'
  );
end;
$function$;

create or replace function private.compact_capital_market_entity_links(
  p_batch_size integer default 20000
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_deleted bigint := 0;
begin
  if p_batch_size < 1 or p_batch_size > 50000 then
    raise exception 'p_batch_size must be between 1 and 50000';
  end if;

  with doomed as (
    select id
    from public.capital_market_entity_links
    where not is_primary_origination_target
      and entity_role not in ('debtor', 'originator', 'assignor', 'securitizer')
    order by id
    limit p_batch_size
  )
  delete from public.capital_market_entity_links target
  using doomed
  where target.id = doomed.id;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'deleted', v_deleted,
    'batchSize', p_batch_size,
    'remaining', (
      select count(*)
      from public.capital_market_entity_links
      where not is_primary_origination_target
        and entity_role not in ('debtor', 'originator', 'assignor', 'securitizer')
    )
  );
end;
$function$;

revoke all on function private.compact_capital_market_entity_links(integer)
  from public, anon, authenticated;
grant execute on function private.compact_capital_market_entity_links(integer)
  to service_role, postgres;

update public.source_catalog
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'capitalMarketStoragePolicy', jsonb_build_object(
        'hotMode', 'compact_manifest',
        'rawPayloadInEvents', false,
        'decisionEntityRoles', jsonb_build_array(
          'primary_origination_target', 'debtor', 'originator', 'assignor', 'securitizer'
        ),
        'coldEvidence', 'official_source_and_archive_manifest',
        'effectiveAt', now()
      )
    ),
    updated_at = now()
where metadata->>'code' like 'src_cvm_%';

commit;
