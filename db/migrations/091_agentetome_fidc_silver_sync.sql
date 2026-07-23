-- Idempotent promotion from Agentetome bronze records into FIDC capital-market events.
-- Entity resolution may populate issuer_company_id on an exact CNPJ match, but
-- company score impact remains explicitly disabled.

create or replace function private.sync_agentetome_fidc_market_events(p_package_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_package public.agentetome_export_packages%rowtype;
  v_events integer := 0;
  v_exact_company_matches integer := 0;
begin
  if nullif(trim(p_package_hash),'') is null then
    raise exception 'package_hash_required';
  end if;

  select * into v_package
  from public.agentetome_export_packages
  where content_hash=p_package_hash
  limit 1;

  if not found then raise exception 'agentetome_package_not_found'; end if;
  if v_package.status<>'parsed' then raise exception 'agentetome_package_not_parsed'; end if;
  if v_package.schema_version<>1 then raise exception 'unsupported_agentetome_schema'; end if;

  with source_rows as (
    select
      b.record_key,
      b.ref_date,
      b.entity_cnpj,
      b.payload,
      b.source_url,
      b.content_hash,
      q.payload as quality_payload,
      c.id as company_id
    from public.bronze_historical_records b
    left join lateral (
      select q1.payload
      from public.bronze_historical_records q1
      where q1.dataset_code='agentetome_qualidade_operacional_v1'
        and q1.entity_cnpj=b.entity_cnpj
        and q1.payload#>>'{_lineage,package_hash}'=p_package_hash
      order by q1.ref_date desc nulls last, q1.record_key
      limit 1
    ) q on true
    left join public.companies c
      on regexp_replace(coalesce(c.cnpj,''),'\D','','g')=b.entity_cnpj
    where b.dataset_code='agentetome_fidc_consolidado_v1'
      and b.payload#>>'{_lineage,package_hash}'=p_package_hash
  ), upserted as (
    insert into public.capital_market_events (
      id,dataset_code,source_code,record_key,event_type,instrument_type,
      issuer_company_id,issuer_cnpj,issuer_name,fund_cnpj,fund_name,
      status,reference_date,event_date,volume,currency,source_url,
      source_resource_name,source_file_name,raw_payload,normalized_payload,
      observed_at,content_hash,created_at,updated_at
    )
    select
      gen_random_uuid(),
      'agentetome_fidc_consolidado_v1',
      'src_agentetome_api',
      s.record_key,
      'fund_portfolio_snapshot',
      'FIDC',
      s.company_id,
      case when s.company_id is not null then s.entity_cnpj end,
      null,
      s.entity_cnpj,
      nullif(s.payload->>'nome',''),
      nullif(s.payload->>'status_entrega',''),
      s.ref_date,
      case when s.payload->>'data_entrega' ~ '^\d{4}-\d{2}-\d{2}$' then (s.payload->>'data_entrega')::date end,
      case when s.payload->>'pl' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.payload->>'pl')::numeric end,
      'BRL',
      s.source_url,
      'Agentetome — export por administradora',
      'fidc_consolidado.csv',
      s.payload,
      jsonb_strip_nulls(jsonb_build_object(
        'schemaVersion',1,
        'informeId',nullif(s.payload->>'informe_id',''),
        'competence',nullif(s.payload->>'competencia',''),
        'administratorCnpj',nullif(s.payload->>'admin_cnpj',''),
        'administratorName',nullif(s.payload->>'admin_nome',''),
        'manager',nullif(s.payload->>'gestor',''),
        'custodian',nullif(s.payload->>'custodiante',''),
        'portfolio',case when s.payload->>'carteira' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.payload->>'carteira')::numeric end,
        'delinquencyTotal',case when s.payload->>'inad_total' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.payload->>'inad_total')::numeric end,
        'delinquencyToNav',case when s.payload->>'razao_inad_pl' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.payload->>'razao_inad_pl')::numeric end,
        'pdd',case when s.payload->>'pdd' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.payload->>'pdd')::numeric end,
        'subordinationPct',case when s.payload->>'subordinacao_pct' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.payload->>'subordinacao_pct')::numeric end,
        'investors',case when s.payload->>'qt_cotistas' ~ '^-?[0-9]+$' then (s.payload->>'qt_cotistas')::integer end,
        'currentViolations',case when s.payload->>'qt_violacoes_vigentes' ~ '^-?[0-9]+$' then (s.payload->>'qt_violacoes_vigentes')::integer end,
        'operationalQuality',case when s.quality_payload is null then null else jsonb_strip_nulls(jsonb_build_object(
          'silenceStatus',nullif(s.quality_payload->>'status_silencio',''),
          'monthsWithoutReport',case when s.quality_payload->>'meses_sem_informe' ~ '^-?[0-9]+$' then (s.quality_payload->>'meses_sem_informe')::integer end,
          'deliveries12m',case when s.quality_payload->>'entregas_12m' ~ '^-?[0-9]+$' then (s.quality_payload->>'entregas_12m')::integer end,
          'delays12m',case when s.quality_payload->>'atrasos_12m' ~ '^-?[0-9]+$' then (s.quality_payload->>'atrasos_12m')::integer end,
          'medianDelayDays',case when s.quality_payload->>'atraso_mediano_dias' ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.quality_payload->>'atraso_mediano_dias')::numeric end,
          'reFilings12m',case when s.quality_payload->>'reapresentacoes_12m' ~ '^-?[0-9]+$' then (s.quality_payload->>'reapresentacoes_12m')::integer end,
          'currentViolations',case when s.quality_payload->>'violacoes_vigentes' ~ '^-?[0-9]+$' then (s.quality_payload->>'violacoes_vigentes')::integer end,
          'violatedRules',nullif(s.quality_payload->>'regras_violadas','')
        )) end,
        'companyResolution',jsonb_build_object(
          'status',case when s.company_id is null then 'unresolved' else 'exact_cnpj' end,
          'reason',case when s.company_id is null then 'no_exact_company_master_match' else 'fund_cnpj_matches_company_cnpj' end,
          'scoreImpact',false
        ),
        'lineage',s.payload->'_lineage'
      )),
      now(),
      s.content_hash,
      now(),
      now()
    from source_rows s
    on conflict (dataset_code,record_key) do update set
      issuer_company_id=excluded.issuer_company_id,
      issuer_cnpj=excluded.issuer_cnpj,
      status=excluded.status,
      reference_date=excluded.reference_date,
      event_date=excluded.event_date,
      volume=excluded.volume,
      source_url=excluded.source_url,
      raw_payload=excluded.raw_payload,
      normalized_payload=excluded.normalized_payload,
      observed_at=excluded.observed_at,
      content_hash=excluded.content_hash,
      updated_at=now()
    returning issuer_company_id
  )
  select count(*)::integer,
         count(*) filter (where issuer_company_id is not null)::integer
  into v_events,v_exact_company_matches
  from upserted;

  update public.capital_market_dataset_runs
  set events_written=v_events,
      metadata=metadata||jsonb_build_object(
        'silver_stage','capital_market_events',
        'fidc_events_written',v_events,
        'company_master_exact_matches',v_exact_company_matches,
        'company_resolution_status',case when v_exact_company_matches=0 then 'unresolved_without_exact_match' else 'partial_exact_match' end,
        'score_impact',false
      ),
      updated_at=now()
  where dataset_code='agentetome_admin_export_v1'
    and metadata->>'package_id'=v_package.id::text;

  update public.agentetome_export_packages
  set metadata=metadata||jsonb_build_object(
        'fidc_events_written',v_events,
        'company_master_exact_matches',v_exact_company_matches,
        'score_impact',false,
        'silver_synced_at',now()
      ),
      updated_at=now()
  where id=v_package.id;

  return jsonb_build_object(
    'status','completed',
    'package_id',v_package.id,
    'package_hash',v_package.content_hash,
    'fidc_events_written',v_events,
    'company_master_exact_matches',v_exact_company_matches,
    'score_impact',false
  );
end;
$$;

revoke all on function private.sync_agentetome_fidc_market_events(text)
  from public, anon, authenticated;
grant execute on function private.sync_agentetome_fidc_market_events(text)
  to service_role;

comment on function private.sync_agentetome_fidc_market_events(text) is
  'Idempotently promotes one parsed Agentetome package from bronze to FIDC capital-market events. Company score impact remains disabled.';
