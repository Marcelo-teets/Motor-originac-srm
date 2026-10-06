-- Agentetome control plane on Neon + Vercel.
--
-- Replaces the legacy pieces that depended on the old provider runtime:
--   * vault secret            -> AGENTETOME_API_KEY in the Vercel environment
--   * pgsql-http / pg_net      -> provider calls made by serverless/agentetome-pipeline.ts
--   * Edge Function ingestion  -> same pipeline (download ZIP, validate, bronze, finalize)
--   * pg_cron hourly refresh   -> .github/workflows/neon-scheduled-jobs.yml calling
--                                 /api/agentetome?operation=due-exports (CRON_SECRET)
--   * private storage bucket   -> raw ZIP is not persisted; hash + row counts + bronze rows are.
--
-- Tables, finalize/silver/market-map functions come verbatim from 079-092/128/129
-- (patched by scripts/lib/neon-migration-patches.mjs). This file only defines the
-- functions whose legacy versions performed network I/O or read vault/cron.

begin;

-- Runtime status ---------------------------------------------------------------
-- p_secret_configured comes from the Vercel runtime (Boolean(process.env.AGENTETOME_API_KEY)).
-- When called from SQL (refresh_agentetome_source_status) the last value reported by
-- the runtime is used. "automaticRefresh" is true only when the scheduler really ran a
-- scheduled/retry attempt in the last 36 hours.
create or replace function public.agentetome_runtime_status(p_secret_configured boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source public.source_catalog%rowtype;
  v_secret_configured boolean;
  v_active_targets integer;
  v_parsed_packages integer;
  v_failed_packages integer;
  v_bronze_rows bigint;
  v_fidc_events integer;
  v_historical_fidc_events integer;
  v_last_package_at timestamptz;
  v_last_check_at timestamptz;
  v_last_success_at timestamptz;
  v_last_scheduled_at timestamptz;
  v_latest_reference_date date;
  v_latest_observed_at timestamptz;
  v_scheduler_active boolean;
  v_ready boolean;
  v_fresh boolean;
  v_blockers jsonb := '[]'::jsonb;
begin
  select * into v_source
  from public.source_catalog
  where metadata->>'code' = 'src_agentetome_api'
  limit 1;

  v_secret_configured := coalesce(
    p_secret_configured,
    nullif(v_source.metadata->>'secretConfigured', '')::boolean,
    false
  );

  select count(*) filter (where active), max(last_success_at),
         max(last_attempt_at) filter (where metadata->>'lastTriggerType' in ('scheduled', 'retry'))
  into v_active_targets, v_last_success_at, v_last_scheduled_at
  from public.agentetome_export_targets;

  select count(*) filter (where status = 'parsed'), count(*) filter (where status = 'failed'), max(updated_at)
  into v_parsed_packages, v_failed_packages, v_last_package_at
  from public.agentetome_export_packages;

  select count(*)::bigint into v_bronze_rows
  from public.bronze_historical_records
  where dataset_code like 'agentetome\_%' escape '\';

  select count(*)::integer, max(reference_date), max(observed_at)
  into v_fidc_events, v_latest_reference_date, v_latest_observed_at
  from public.agentetome_fidc_market_map_v1;

  select count(*)::integer into v_historical_fidc_events
  from public.capital_market_events
  where dataset_code = 'agentetome_fidc_consolidado_v1'
    and source_code = 'src_agentetome_api';

  select max(finished_at) filter (where status = 'completed')
  into v_last_check_at
  from public.source_connector_runs
  where source_id = v_source.id;

  v_last_success_at := greatest(v_last_success_at, v_last_check_at);
  v_scheduler_active := v_last_scheduled_at is not null and v_last_scheduled_at >= now() - interval '36 hours';

  if not v_secret_configured then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'secret_missing', 'title', 'Chave do Agentetome ausente no runtime',
      'nextAction', 'Cadastrar AGENTETOME_API_KEY nas variáveis de ambiente do projeto na Vercel.'
    ));
  end if;
  if v_active_targets = 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_active_target', 'title', 'Nenhuma administradora ativa',
      'nextAction', 'Ativar ao menos um registro em agentetome_export_targets.'
    ));
  end if;
  if v_parsed_packages = 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_parsed_package', 'title', 'Nenhum pacote validado',
      'nextAction', 'Executar uma ingestão real por administradora.'
    ));
  end if;
  if v_fidc_events = 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'no_fidc_events', 'title', 'Snapshot FIDC vazio',
      'nextAction', 'Sincronizar o pacote atual para o Market Map.'
    ));
  end if;
  if not v_scheduler_active then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'scheduler_inactive', 'title', 'Refresh automático sem execução nas últimas 36 horas',
      'nextAction', 'Verificar o workflow neon-scheduled-jobs e o CRON_SECRET do endpoint /api/agentetome.'
    ));
  end if;

  v_ready := v_secret_configured and v_active_targets > 0 and v_parsed_packages > 0
    and v_fidc_events > 0 and v_scheduler_active;
  v_fresh := v_last_check_at is not null and v_last_check_at >= now() - interval '36 hours';

  if v_ready and not v_fresh then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'refresh_stale', 'title', 'Última verificação acima de 36 horas',
      'nextAction', 'Executar refresh manual ou validar o worker agendado.'
    ));
  end if;

  return jsonb_build_object(
    'provider', 'agentetome', 'sourceCode', 'src_agentetome_api',
    'status', case when v_ready then 'real' else 'partial' end,
    'health', case when v_ready and v_fresh then 'healthy' else 'degraded' end,
    'configured', v_secret_configured, 'secretMode', 'vercel_env',
    'automaticRefresh', v_scheduler_active, 'lastScheduledAttemptAt', v_last_scheduled_at,
    'activeTargets', v_active_targets,
    'parsedPackages', v_parsed_packages, 'failedPackages', v_failed_packages,
    'bronzeRows', v_bronze_rows, 'fidcEvents', v_fidc_events,
    'historicalFidcEvents', v_historical_fidc_events,
    'lastPackageAt', v_last_package_at, 'lastCheckAt', v_last_check_at,
    'lastSuccessAt', v_last_success_at, 'latestReferenceDate', v_latest_reference_date,
    'latestObservedAt', v_latest_observed_at, 'marketMapReady', v_fidc_events > 0,
    'scoreImpact', false,
    'capabilities', jsonb_build_array('validate_fidc_xml', 'admin_manifest', 'admin_export_ingestion', 'fidc_market_map'),
    'runtime', jsonb_build_object(
      'api', 'api/agentetome.ts',
      'pipeline', 'serverless/agentetome-pipeline.ts',
      'scheduler', '.github/workflows/neon-scheduled-jobs.yml',
      'rawZipPersisted', false
    ),
    'blockers', v_blockers, 'generatedAt', now()
  );
end;
$$;
revoke all on function public.agentetome_runtime_status(boolean) from public, anon, authenticated;
grant execute on function public.agentetome_runtime_status(boolean) to service_role;

-- Source catalog mirror of the runtime status (same contract as 128, Neon channels).
create or replace function private.refresh_agentetome_source_status()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_status jsonb;
begin
  v_status := public.agentetome_runtime_status(null);

  update public.source_catalog
  set
    frequency = 'hourly_control_daily_export',
    status = v_status->>'status',
    health = v_status->>'health',
    metadata = (metadata
      - 'marketMapVercelStatus'
      - 'vercelBuildChannelStatus'
      - 'marketMapProductStatus'
      - 'implementationPhase'
      - 'downstreamPhase'
      - 'runtimeChannels'
      - 'supabaseRuntimeStatus') || jsonb_build_object(
        'implementationPhase', 'production_operational',
        'downstreamPhase', 'scheduled_export_bronze_silver_market_map',
        'implementedRuntime', true,
        'runtimeCodeReady', true,
        'runtimeStatus', v_status->>'status',
        'runtimeChannels', jsonb_build_object(
          'vercelApi', 'vercel_env',
          'ingestion', 'vercel_pipeline',
          'xmlValidation', 'vercel_proxy'
        ),
        'automaticRefresh', coalesce((v_status->>'automaticRefresh')::boolean, false),
        'activeTargets', coalesce((v_status->>'activeTargets')::integer, 0),
        'parsedPackages', coalesce((v_status->>'parsedPackages')::integer, 0),
        'bronzeRowsAvailable', coalesce((v_status->>'bronzeRows')::bigint, 0),
        'fidcMarketEventsAvailable', coalesce((v_status->>'fidcEvents')::integer, 0),
        'lastSuccessfulExportAt', v_status->>'lastSuccessAt',
        'latestReferenceDate', v_status->>'latestReferenceDate',
        'automaticScoreImpact', false,
        'marketMapScoreImpact', false,
        'runtimeStatusValidatedAt', now()
      ),
    updated_at = now()
  where metadata->>'code' = 'src_agentetome_api';

  return v_status;
end;
$$;
revoke all on function private.refresh_agentetome_source_status() from public, anon, authenticated;

-- Admin manifest: the provider call happens in Vercel; this records the audit row.
create or replace function public.record_agentetome_admin_manifest(
  p_admin text,
  p_cut text,
  p_competence text,
  p_requested_by uuid,
  p_http_status integer,
  p_duration_ms integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source_id uuid;
  v_ok boolean;
begin
  select id into v_source_id
  from public.source_catalog
  where metadata->>'code' = 'src_agentetome_api'
  limit 1;

  v_ok := coalesce(p_http_status, 502) between 200 and 299
    and coalesce(nullif(p_payload->>'schema_versao', '')::integer, 0) = 1;

  insert into public.agentetome_operation_runs (
    source_id, requested_by, operation, status, administrator, competence,
    request_fingerprint, response_summary, http_status, duration_ms
  ) values (
    v_source_id, p_requested_by, 'admin_manifest', case when v_ok then 'completed' else 'failed' end,
    trim(p_admin), p_competence,
    encode(digest(jsonb_build_object(
      'administrator', trim(p_admin), 'cut', p_cut, 'competence', p_competence
    )::text, 'sha256'), 'hex'),
    jsonb_build_object(
      'schema_version', p_payload->>'schema_versao',
      'filter', coalesce(p_payload->'filtro', '{}'::jsonb),
      'files', coalesce(p_payload->'arquivos', '{}'::jsonb),
      'provider_error', not v_ok,
      'raw_download_link_persisted', false
    ),
    coalesce(p_http_status, 502), greatest(0, coalesce(p_duration_ms, 0))
  );

  return jsonb_build_object(
    'provider', 'agentetome', 'operation', 'admin_manifest',
    'admin', trim(p_admin), 'cut', p_cut, 'competence', p_competence,
    'http_status', coalesce(p_http_status, 502), 'duration_ms', greatest(0, coalesce(p_duration_ms, 0)),
    'payload', coalesce(p_payload, '{}'::jsonb), 'provider_error', not v_ok
  );
end;
$$;
revoke all on function public.record_agentetome_admin_manifest(text, text, text, uuid, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_agentetome_admin_manifest(text, text, text, uuid, integer, integer, jsonb)
  to service_role;

-- Export attempt bookkeeping (replaces the queue/exception branches of 128).
create or replace function public.record_agentetome_export_attempt(
  p_admin text,
  p_cut text,
  p_competence text,
  p_format text,
  p_requested_by uuid,
  p_trigger_type text,
  p_status text,
  p_error text default null,
  p_http_status integer default null,
  p_duration_ms integer default null,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_source_id uuid;
begin
  if p_trigger_type not in ('manual', 'scheduled', 'retry') then
    raise exception 'invalid_agentetome_trigger_type';
  end if;
  if p_status not in ('started', 'failed') then
    raise exception 'invalid_agentetome_attempt_status';
  end if;

  select id into v_source_id
  from public.source_catalog
  where metadata->>'code' = 'src_agentetome_api'
  limit 1;

  if p_status = 'started' then
    update public.source_catalog
    set metadata = metadata || jsonb_build_object('secretConfigured', true), updated_at = now()
    where id = v_source_id;

    update public.agentetome_export_targets
    set last_attempt_at = now(), last_queued_at = now(), last_status = 'queued', last_error = null,
        metadata = metadata || jsonb_build_object('lastTriggerType', p_trigger_type, 'lastQueuedAt', now()),
        updated_at = now()
    where lower(administrator) = lower(trim(p_admin));
    return jsonb_build_object('status', 'started', 'sourceId', v_source_id, 'administrator', trim(p_admin), 'trigger_type', p_trigger_type);
  end if;

  insert into public.agentetome_operation_runs (
    source_id, requested_by, operation, status, administrator, competence, format,
    response_summary, http_status, duration_ms
  ) values (
    v_source_id, p_requested_by, 'admin_export', 'failed', trim(p_admin), p_competence, p_format,
    coalesce(p_summary, '{}'::jsonb) || jsonb_build_object(
      'error', left(coalesce(p_error, 'unknown_error'), 900), 'trigger_type', p_trigger_type,
      'raw_download_link_persisted', false
    ),
    coalesce(p_http_status, 502), greatest(0, coalesce(p_duration_ms, 0))
  );

  perform public.record_agentetome_target_failure(p_admin, p_error, 'vercel-agentetome-pipeline-v1');
  update public.agentetome_export_targets
  set metadata = metadata || jsonb_build_object('lastTriggerType', p_trigger_type), updated_at = now()
  where lower(administrator) = lower(trim(p_admin));

  perform private.refresh_agentetome_source_status();
  return jsonb_build_object(
    'status', 'failed', 'provider', 'agentetome', 'provider_error', true,
    'administrator', trim(p_admin), 'trigger_type', p_trigger_type, 'error', p_error
  );
end;
$$;
revoke all on function public.record_agentetome_export_attempt(text, text, text, text, uuid, text, text, text, integer, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_agentetome_export_attempt(text, text, text, text, uuid, text, text, text, integer, integer, jsonb)
  to service_role;

-- Scheduler claim (replaces private.run_agentetome_due_exports + pg_cron).
-- Moves next_run_at forward while claiming so overlapping scheduler runs never pick
-- the same administrator twice.
create or replace function public.claim_due_agentetome_targets(p_limit integer default 1)
returns table(administrator text, cut text, competence text, format text, trigger_type text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with due as (
    select t.id
    from public.agentetome_export_targets t
    where t.active and t.next_run_at <= now()
    order by t.priority asc, t.next_run_at asc
    limit least(greatest(coalesce(p_limit, 1), 1), 3)
    for update skip locked
  ), claimed as (
    update public.agentetome_export_targets t
    set next_run_at = now() + interval '30 minutes', updated_at = now()
    from due
    where t.id = due.id
    returning t.administrator, t.cut, t.competence, t.format, t.consecutive_failures
  )
  select c.administrator, c.cut, c.competence, c.format,
         case when c.consecutive_failures > 0 then 'retry' else 'scheduled' end
  from claimed c;
end;
$$;
revoke all on function public.claim_due_agentetome_targets(integer) from public, anon, authenticated;
grant execute on function public.claim_due_agentetome_targets(integer) to service_role;

select private.refresh_agentetome_source_status();

commit;
