-- Parse each JSON batch once and deduplicate every unique key before upsert.
-- Removes SQLSTATE 21000 and reduces repeated JSON expansion/statement timeouts.

create or replace function public.persist_capital_market_batch(p_records jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_changed integer := 0;
  v_links integer := 0;
  v_metrics integer := 0;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records must be a JSON array';
  end if;

  create temporary table _capital_market_batch_items (
    dataset_code text not null,
    record_key text not null,
    content_hash text,
    bronze jsonb not null,
    event jsonb not null,
    entity_links jsonb not null,
    metrics jsonb not null,
    ordinal bigint not null,
    primary key (dataset_code, record_key)
  ) on commit drop;

  insert into _capital_market_batch_items (
    dataset_code, record_key, content_hash, bronze, event, entity_links, metrics, ordinal
  )
  select distinct on (item -> 'event' ->> 'dataset_code', item -> 'event' ->> 'record_key')
    item -> 'event' ->> 'dataset_code',
    item -> 'event' ->> 'record_key',
    item -> 'event' ->> 'content_hash',
    coalesce(item -> 'bronze', '{}'::jsonb),
    coalesce(item -> 'event', '{}'::jsonb),
    coalesce(item -> 'entity_links', '[]'::jsonb),
    coalesce(item -> 'metrics', '[]'::jsonb),
    ordinal
  from jsonb_array_elements(p_records) with ordinality as input(item, ordinal)
  where nullif(item -> 'event' ->> 'dataset_code', '') is not null
    and nullif(item -> 'event' ->> 'record_key', '') is not null
  order by item -> 'event' ->> 'dataset_code', item -> 'event' ->> 'record_key', ordinal desc;

  select
    count(*) filter (where existing_event.record_key is null and existing_bronze.record_key is null),
    count(*) filter (
      where (existing_event.record_key is not null or existing_bronze.record_key is not null)
        and (existing_event.content_hash is distinct from item.content_hash or existing_bronze.content_hash is distinct from item.content_hash)
    ),
    count(*) filter (where existing_event.content_hash = item.content_hash and existing_bronze.content_hash = item.content_hash)
  into v_inserted, v_updated, v_unchanged
  from _capital_market_batch_items item
  left join public.capital_market_events existing_event
    on existing_event.dataset_code = item.dataset_code and existing_event.record_key = item.record_key
  left join public.bronze_historical_records existing_bronze
    on existing_bronze.dataset_code = item.dataset_code and existing_bronze.record_key = item.record_key;

  v_changed := v_inserted + v_updated;

  insert into public.bronze_historical_records (
    dataset_code, record_key, ref_date, entity_cnpj, payload, source_url, content_hash, ingested_at
  )
  select
    item.bronze ->> 'dataset_code', item.bronze ->> 'record_key', nullif(item.bronze ->> 'ref_date', '')::date,
    nullif(item.bronze ->> 'entity_cnpj', ''), coalesce(item.bronze -> 'payload', '{}'::jsonb),
    item.bronze ->> 'source_url', item.bronze ->> 'content_hash', now()
  from _capital_market_batch_items item
  on conflict (dataset_code, record_key) do update
  set ref_date = excluded.ref_date,
      entity_cnpj = excluded.entity_cnpj,
      payload = excluded.payload,
      source_url = excluded.source_url,
      content_hash = excluded.content_hash,
      ingested_at = now()
  where public.bronze_historical_records.content_hash is distinct from excluded.content_hash;

  insert into public.capital_market_events (
    dataset_code, source_code, record_key, content_hash, event_type, instrument_type,
    issuer_cnpj, issuer_name, fund_cnpj, fund_name, security_code, offer_id, series,
    status, reference_date, event_date, maturity_date, volume, currency, source_url,
    source_resource_name, source_file_name, raw_payload, normalized_payload, observed_at, updated_at
  )
  select
    item.event ->> 'dataset_code', item.event ->> 'source_code', item.event ->> 'record_key', item.event ->> 'content_hash',
    item.event ->> 'event_type', item.event ->> 'instrument_type', nullif(item.event ->> 'issuer_cnpj', ''),
    nullif(item.event ->> 'issuer_name', ''), nullif(item.event ->> 'fund_cnpj', ''), nullif(item.event ->> 'fund_name', ''),
    nullif(item.event ->> 'security_code', ''), nullif(item.event ->> 'offer_id', ''), nullif(item.event ->> 'series', ''),
    nullif(item.event ->> 'status', ''), nullif(item.event ->> 'reference_date', '')::date, nullif(item.event ->> 'event_date', '')::date,
    nullif(item.event ->> 'maturity_date', '')::date, nullif(item.event ->> 'volume', '')::numeric,
    coalesce(nullif(item.event ->> 'currency', ''), 'BRL'), item.event ->> 'source_url', item.event ->> 'source_resource_name',
    item.event ->> 'source_file_name', coalesce(item.event -> 'raw_payload', '{}'::jsonb),
    coalesce(item.event -> 'normalized_payload', '{}'::jsonb), coalesce(nullif(item.event ->> 'observed_at', '')::timestamptz, now()), now()
  from _capital_market_batch_items item
  on conflict (dataset_code, record_key) do update
  set source_code = excluded.source_code,
      content_hash = excluded.content_hash,
      event_type = excluded.event_type,
      instrument_type = excluded.instrument_type,
      issuer_cnpj = excluded.issuer_cnpj,
      issuer_name = excluded.issuer_name,
      fund_cnpj = excluded.fund_cnpj,
      fund_name = excluded.fund_name,
      security_code = excluded.security_code,
      offer_id = excluded.offer_id,
      series = excluded.series,
      status = excluded.status,
      reference_date = excluded.reference_date,
      event_date = excluded.event_date,
      maturity_date = excluded.maturity_date,
      volume = excluded.volume,
      currency = excluded.currency,
      source_url = excluded.source_url,
      source_resource_name = excluded.source_resource_name,
      source_file_name = excluded.source_file_name,
      raw_payload = excluded.raw_payload,
      normalized_payload = excluded.normalized_payload,
      observed_at = excluded.observed_at,
      updated_at = now()
  where public.capital_market_events.content_hash is distinct from excluded.content_hash;

  with deduplicated_links as materialized (
    select distinct on (link ->> 'dataset_code', link ->> 'record_key', link ->> 'entity_role', link ->> 'entity_key') link
    from _capital_market_batch_items item
    cross join lateral jsonb_array_elements(item.entity_links) link
    where nullif(link ->> 'dataset_code', '') is not null
      and nullif(link ->> 'record_key', '') is not null
      and nullif(link ->> 'entity_role', '') is not null
      and nullif(link ->> 'entity_key', '') is not null
    order by link ->> 'dataset_code', link ->> 'record_key', link ->> 'entity_role', link ->> 'entity_key', item.ordinal desc, link::text desc
  )
  insert into public.capital_market_entity_links (
    dataset_code, record_key, content_hash, entity_key, entity_role, entity_cnpj, entity_name,
    is_primary_origination_target, resolution_confidence, source_fields, observed_at, updated_at
  )
  select
    link ->> 'dataset_code', link ->> 'record_key', link ->> 'content_hash', link ->> 'entity_key', link ->> 'entity_role',
    nullif(link ->> 'entity_cnpj', ''), nullif(link ->> 'entity_name', ''),
    coalesce((link ->> 'is_primary_origination_target')::boolean, false), coalesce((link ->> 'resolution_confidence')::numeric, 0.5),
    coalesce(link -> 'source_fields', '[]'::jsonb), coalesce(nullif(link ->> 'observed_at', '')::timestamptz, now()), now()
  from deduplicated_links
  on conflict (dataset_code, record_key, entity_role, entity_key) do update
  set content_hash = excluded.content_hash,
      entity_cnpj = excluded.entity_cnpj,
      entity_name = excluded.entity_name,
      is_primary_origination_target = excluded.is_primary_origination_target,
      resolution_confidence = excluded.resolution_confidence,
      source_fields = excluded.source_fields,
      observed_at = excluded.observed_at,
      updated_at = now();

  get diagnostics v_links = row_count;

  with deduplicated_metrics as materialized (
    select distinct on (metric ->> 'dataset_code', metric ->> 'record_key', metric ->> 'metric_code', metric ->> 'source_column') metric
    from _capital_market_batch_items item
    cross join lateral jsonb_array_elements(item.metrics) metric
    where nullif(metric ->> 'dataset_code', '') is not null
      and nullif(metric ->> 'record_key', '') is not null
      and nullif(metric ->> 'metric_code', '') is not null
      and nullif(metric ->> 'source_column', '') is not null
    order by metric ->> 'dataset_code', metric ->> 'record_key', metric ->> 'metric_code', metric ->> 'source_column', item.ordinal desc, metric::text desc
  )
  insert into public.capital_market_metrics (
    dataset_code, record_key, content_hash, metric_code, metric_label, metric_value, metric_unit,
    reference_date, measurement_scope, source_column, observed_at, updated_at
  )
  select
    metric ->> 'dataset_code', metric ->> 'record_key', metric ->> 'content_hash', metric ->> 'metric_code',
    nullif(metric ->> 'metric_label', ''), (metric ->> 'metric_value')::numeric, metric ->> 'metric_unit',
    nullif(metric ->> 'reference_date', '')::date, nullif(metric ->> 'measurement_scope', ''), metric ->> 'source_column',
    coalesce(nullif(metric ->> 'observed_at', '')::timestamptz, now()), now()
  from deduplicated_metrics
  on conflict (dataset_code, record_key, metric_code, source_column) do update
  set content_hash = excluded.content_hash,
      metric_label = excluded.metric_label,
      metric_value = excluded.metric_value,
      metric_unit = excluded.metric_unit,
      reference_date = excluded.reference_date,
      measurement_scope = excluded.measurement_scope,
      observed_at = excluded.observed_at,
      updated_at = now();

  get diagnostics v_metrics = row_count;

  return jsonb_build_object(
    'bronzeRowsWritten', v_changed,
    'eventsWritten', v_changed,
    'entityLinksWritten', v_links,
    'metricsWritten', v_metrics,
    'recordsInserted', v_inserted,
    'recordsUpdated', v_updated,
    'recordsUnchanged', v_unchanged,
    'inputRecords', jsonb_array_length(p_records),
    'deduplicatedRecords', (select count(*) from _capital_market_batch_items)
  );
end;
$$;

revoke all on function public.persist_capital_market_batch(jsonb) from public, anon, authenticated;
grant execute on function public.persist_capital_market_batch(jsonb) to service_role;

comment on function public.persist_capital_market_batch(jsonb) is
  'Atomic CVM persistence with pre-upsert deduplication for events, bronze rows, entity links and metrics.';
