-- Preserve current-package membership for deduplicated bronze rows and make the
-- Market Map a current snapshot (latest parsed package per active target), while
-- retaining older events for audit/history.

create or replace function private.normalize_agentetome_bronze_record_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog,public,private
as $$
declare
  v_existing public.bronze_historical_records%rowtype;
  v_package_hash text;
  v_package_hashes jsonb;
begin
  if new.dataset_code like 'agentetome\_%' escape '\' then
    if nullif(new.content_hash,'') is null then
      raise exception 'agentetome_content_hash_required';
    end if;

    if position('|row_sha256=' in new.record_key)=0 then
      new.record_key := new.record_key||'|row_sha256='||new.content_hash;
    end if;

    if tg_op='INSERT' then
      select * into v_existing
      from public.bronze_historical_records existing
      where existing.dataset_code=new.dataset_code
        and existing.record_key=new.record_key
      for update;

      if found then
        v_package_hash := nullif(new.payload#>>'{_lineage,package_hash}','');
        select coalesce(jsonb_agg(value order by value),'[]'::jsonb)
        into v_package_hashes
        from (
          select distinct value
          from jsonb_array_elements_text(
            coalesce(v_existing.payload#>'{_lineage,package_hashes}','[]'::jsonb)
            || case when nullif(v_existing.payload#>>'{_lineage,package_hash}','') is null
                 then '[]'::jsonb else jsonb_build_array(v_existing.payload#>>'{_lineage,package_hash}') end
            || case when v_package_hash is null then '[]'::jsonb else jsonb_build_array(v_package_hash) end
          ) hashes(value)
        ) deduped;

        update public.bronze_historical_records
        set
          payload=jsonb_set(
            jsonb_set(
              v_existing.payload,
              '{_lineage,package_hash}',
              coalesce(to_jsonb(v_package_hash),v_existing.payload#>'{_lineage,package_hash}'),
              true
            ),
            '{_lineage,package_hashes}',
            v_package_hashes,
            true
          ),
          source_url=new.source_url
        where dataset_code=new.dataset_code and record_key=new.record_key;
        return null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace view public.agentetome_fidc_market_map_v1
with (security_invoker=true)
as
with current_packages as (
  select distinct on (lower(target.administrator))
    package.content_hash
  from public.agentetome_export_targets target
  join public.agentetome_export_packages package
    on lower(package.administrator)=lower(target.administrator)
   and package.status='parsed'
  where target.active
  order by lower(target.administrator),package.provider_generated_at desc nulls last,package.updated_at desc,package.id desc
), current_events as (
  select event.*
  from public.capital_market_events event
  join current_packages package
    on event.normalized_payload#>>'{lineage,package_hash}'=package.content_hash
  where event.dataset_code='agentetome_fidc_consolidado_v1'
    and event.source_code='src_agentetome_api'
    and event.instrument_type='FIDC'
)
select
  id as event_id,
  fund_cnpj,
  fund_name,
  reference_date,
  event_date as delivered_at,
  status as delivery_status,
  volume as nav,
  case when normalized_payload->>'portfolio' ~ '^-?[0-9]+(\.[0-9]+)?$' then (normalized_payload->>'portfolio')::numeric end as portfolio,
  case when normalized_payload->>'delinquencyTotal' ~ '^-?[0-9]+(\.[0-9]+)?$' then (normalized_payload->>'delinquencyTotal')::numeric end as delinquency_total,
  case when normalized_payload->>'delinquencyToNav' ~ '^-?[0-9]+(\.[0-9]+)?$' then (normalized_payload->>'delinquencyToNav')::numeric end as delinquency_to_nav,
  case when normalized_payload->>'pdd' ~ '^-?[0-9]+(\.[0-9]+)?$' then (normalized_payload->>'pdd')::numeric end as pdd,
  case when normalized_payload->>'subordinationPct' ~ '^-?[0-9]+(\.[0-9]+)?$' then (normalized_payload->>'subordinationPct')::numeric end as subordination_pct,
  case when normalized_payload->>'investors' ~ '^-?[0-9]+$' then (normalized_payload->>'investors')::integer end as investors,
  normalized_payload->>'administratorCnpj' as administrator_cnpj,
  normalized_payload->>'administratorName' as administrator_name,
  normalized_payload->>'manager' as manager_name,
  normalized_payload->>'custodian' as custodian_name,
  normalized_payload#>>'{operationalQuality,silenceStatus}' as silence_status,
  case when normalized_payload#>>'{operationalQuality,monthsWithoutReport}' ~ '^-?[0-9]+$' then (normalized_payload#>>'{operationalQuality,monthsWithoutReport}')::integer end as months_without_report,
  case when normalized_payload#>>'{operationalQuality,delays12m}' ~ '^-?[0-9]+$' then (normalized_payload#>>'{operationalQuality,delays12m}')::integer end as delays_12m,
  case when normalized_payload#>>'{operationalQuality,reFilings12m}' ~ '^-?[0-9]+$' then (normalized_payload#>>'{operationalQuality,reFilings12m}')::integer end as refilings_12m,
  case when normalized_payload->>'currentViolations' ~ '^-?[0-9]+$' then (normalized_payload->>'currentViolations')::integer end as current_violations,
  normalized_payload#>>'{companyResolution,status}' as company_resolution_status,
  issuer_company_id,
  source_url,
  content_hash,
  observed_at,
  updated_at
from current_events;

revoke all on public.agentetome_fidc_market_map_v1 from public,anon,authenticated;
grant select on public.agentetome_fidc_market_map_v1 to service_role;

comment on view public.agentetome_fidc_market_map_v1 is
  'Current Agentetome FIDC snapshot: latest parsed package per active export target. Historical events remain in capital_market_events.';

notify pgrst,'reload schema';
