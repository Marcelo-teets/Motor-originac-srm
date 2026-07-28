begin;

create or replace function private.compact_capital_market_event_payloads(
  p_batch_size integer default 5000
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_updated bigint := 0;
begin
  if p_batch_size < 1 or p_batch_size > 25000 then
    raise exception 'p_batch_size must be between 1 and 25000';
  end if;

  with targets as (
    select id
    from public.capital_market_events
    where dataset_code like 'cvm_%'
      and (
        raw_payload <> '{}'::jsonb
        or coalesce(normalized_payload ->> 'storageMode', '') <> 'free_tier_compact_hot'
      )
    order by id
    limit p_batch_size
  )
  update public.capital_market_events target
  set raw_payload = '{}'::jsonb,
      normalized_payload = jsonb_strip_nulls(jsonb_build_object(
        'sourceCode', target.source_code,
        'packageId', target.normalized_payload -> 'packageId',
        'resourceId', target.normalized_payload -> 'resourceId',
        'resourceModifiedAt', target.normalized_payload -> 'resourceModifiedAt',
        'fileName', target.source_file_name,
        'storageMode', 'free_tier_compact_hot',
        'rawEvidence', jsonb_build_object(
          'mode', 'official_source_and_cold_archive',
          'sourceUrl', target.source_url,
          'contentHash', target.content_hash,
          'resourceName', target.source_resource_name,
          'fileName', target.source_file_name
        )
      )),
      updated_at = now()
  from targets
  where target.id = targets.id;

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'updated', v_updated,
    'batchSize', p_batch_size,
    'storageMode', 'free_tier_compact_hot'
  );
end;
$function$;

revoke all on function private.compact_capital_market_event_payloads(integer)
  from public, anon, authenticated;
grant execute on function private.compact_capital_market_event_payloads(integer)
  to service_role, postgres;

commit;
