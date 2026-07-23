-- Agentetome export ingestion, private package storage, bronze lineage and FIDC market-map silver.
-- The provider key stays in Supabase Vault. Signed download URLs are never persisted.

create table if not exists public.agentetome_export_packages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.source_catalog(id) on delete set null,
  connector_run_id uuid references public.source_connector_runs(id) on delete set null,
  operation_run_id uuid references public.agentetome_operation_runs(id) on delete set null,
  administrator text not null,
  cut text not null check (cut in ('recente','competencia')),
  competence text,
  format text not null check (format in ('csv','xlsx')),
  schema_version integer not null check (schema_version > 0),
  provider_file_name text not null,
  provider_generated_at timestamptz,
  provider_expires_at timestamptz,
  storage_bucket text not null,
  storage_path text not null,
  content_hash text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text,
  file_count integer not null default 0 check (file_count >= 0),
  row_counts jsonb not null default '{}'::jsonb,
  headers jsonb not null default '{}'::jsonb,
  status text not null default 'stored' check (status in ('stored','parsed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_hash),
  unique (storage_bucket, storage_path)
);

create index if not exists agentetome_export_packages_admin_created_idx
  on public.agentetome_export_packages (administrator, created_at desc);
create index if not exists agentetome_export_packages_source_idx
  on public.agentetome_export_packages (source_id);
create index if not exists agentetome_export_packages_connector_run_idx
  on public.agentetome_export_packages (connector_run_id);
create index if not exists agentetome_export_packages_operation_run_idx
  on public.agentetome_export_packages (operation_run_id);

alter table public.agentetome_export_packages enable row level security;
revoke all on table public.agentetome_export_packages from public, anon, authenticated;
grant select, insert, update, delete on table public.agentetome_export_packages to service_role;
drop policy if exists agentetome_export_packages_service_role_all on public.agentetome_export_packages;
create policy agentetome_export_packages_service_role_all
  on public.agentetome_export_packages
  for all to service_role
  using (true) with check (true);

create table if not exists public.agentetome_ingestion_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  purpose text not null default 'agentetome_raw_ingestion',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists agentetome_ingestion_tokens_expiry_idx
  on public.agentetome_ingestion_tokens (expires_at)
  where consumed_at is null;

alter table public.agentetome_ingestion_tokens enable row level security;
revoke all on table public.agentetome_ingestion_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.agentetome_ingestion_tokens to service_role;
drop policy if exists agentetome_ingestion_tokens_service_role_all on public.agentetome_ingestion_tokens;
create policy agentetome_ingestion_tokens_service_role_all
  on public.agentetome_ingestion_tokens
  for all to service_role
  using (true) with check (true);

create or replace function public.claim_agentetome_ingestion_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.agentetome_ingestion_tokens%rowtype;
begin
  update public.agentetome_ingestion_tokens
  set consumed_at=now()
  where token_hash=p_token_hash
    and consumed_at is null
    and expires_at > now()
  returning * into v_token;

  if v_token.id is null then return null; end if;

  return jsonb_build_object(
    'id',v_token.id,
    'purpose',v_token.purpose,
    'expires_at',v_token.expires_at,
    'metadata',v_token.metadata
  );
end;
$$;

revoke all on function public.claim_agentetome_ingestion_token(text) from public, anon, authenticated;
grant execute on function public.claim_agentetome_ingestion_token(text) to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'agentetome-raw',
  'agentetome-raw',
  false,
  26214400,
  array['application/zip','application/octet-stream']::text[]
)
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.request_agentetome_admin_export(
  p_admin text default 'oliveira trust',
  p_cut text default 'recente',
  p_competence text default null,
  p_format text default 'csv'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, vault, private
as $$
declare
  v_api_key text;
  v_request jsonb;
  v_response extensions.http_response;
  v_rpc jsonb;
  v_tool_text text;
  v_payload jsonb;
  v_started_at timestamptz := clock_timestamp();
begin
  if nullif(trim(p_admin),'') is null then raise exception 'admin_required'; end if;
  if p_cut not in ('recente','competencia') then raise exception 'invalid_cut'; end if;
  if p_format not in ('csv','xlsx') then raise exception 'invalid_format'; end if;
  if p_cut='competencia' and (p_competence is null or p_competence !~ '^\d{4}-\d{2}$') then
    raise exception 'invalid_competence';
  end if;

  select decrypted_secret into v_api_key
  from vault.decrypted_secrets
  where name='agentetome_api_key'
  limit 1;
  if v_api_key is null then raise exception 'agentetome_secret_missing'; end if;

  v_request := jsonb_build_object(
    'jsonrpc','2.0',
    'id',gen_random_uuid()::text,
    'method','tools/call',
    'params',jsonb_build_object(
      'name','exportar_admin',
      'arguments',jsonb_strip_nulls(jsonb_build_object(
        'admin',trim(p_admin),
        'corte',p_cut,
        'competencia',p_competence,
        'formato',p_format
      ))
    )
  );

  v_response := extensions.http(
    row(
      'POST'::extensions.http_method,
      'https://www.agentetome.com/api/mcp'::varchar,
      array[
        row('Authorization'::varchar,('Bearer '||v_api_key)::varchar)::extensions.http_header,
        row('Accept'::varchar,'application/json'::varchar)::extensions.http_header,
        row('Content-Type'::varchar,'application/json'::varchar)::extensions.http_header
      ]::extensions.http_header[],
      'application/json'::varchar,
      v_request::text::varchar
    )::extensions.http_request
  );

  begin
    v_rpc := coalesce(v_response.content,'{}')::jsonb;
  exception when others then
    raise exception 'agentetome_invalid_rpc_response';
  end;

  if v_response.status < 200 or v_response.status >= 300 then
    return jsonb_build_object(
      'provider','agentetome',
      'operation','admin_export',
      'http_status',v_response.status,
      'duration_ms',floor(extract(epoch from (clock_timestamp()-v_started_at))*1000),
      'provider_error',true,
      'rpc_error',coalesce(v_rpc->'error',v_rpc)
    );
  end if;

  if v_rpc ? 'error' then
    return jsonb_build_object(
      'provider','agentetome',
      'operation','admin_export',
      'http_status',v_response.status,
      'duration_ms',floor(extract(epoch from (clock_timestamp()-v_started_at))*1000),
      'provider_error',true,
      'rpc_error',v_rpc->'error'
    );
  end if;

  select item->>'text' into v_tool_text
  from jsonb_array_elements(coalesce(v_rpc#>'{result,content}','[]'::jsonb)) item
  where item->>'type'='text'
  limit 1;
  if v_tool_text is null then raise exception 'agentetome_empty_tool_response'; end if;

  begin
    v_payload := v_tool_text::jsonb;
  exception when others then
    v_payload := jsonb_build_object('text',left(v_tool_text,4000));
  end;

  return jsonb_build_object(
    'provider','agentetome',
    'operation','admin_export',
    'admin',trim(p_admin),
    'cut',p_cut,
    'competence',p_competence,
    'format',p_format,
    'http_status',v_response.status,
    'duration_ms',floor(extract(epoch from (clock_timestamp()-v_started_at))*1000),
    'provider_error',coalesce((v_rpc#>>'{result,isError}')::boolean,false),
    'payload',v_payload
  );
end;
$$;

revoke all on function private.request_agentetome_admin_export(text,text,text,text)
  from public, anon, authenticated;
grant execute on function private.request_agentetome_admin_export(text,text,text,text)
  to service_role;

create or replace function private.run_agentetome_export_ingestion(
  p_admin text default 'oliveira trust',
  p_cut text default 'recente',
  p_competence text default null,
  p_format text default 'csv'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private, net
as $$
declare
  v_export jsonb;
  v_payload jsonb;
  v_manifest jsonb;
  v_source_id uuid;
  v_token_id uuid;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_request_id bigint;
begin
  v_export := private.request_agentetome_admin_export(p_admin,p_cut,p_competence,p_format);
  if coalesce((v_export->>'http_status')::integer,0)<>200
     or coalesce((v_export->>'provider_error')::boolean,true) then
    raise exception 'agentetome_export_request_failed';
  end if;

  v_payload := v_export->'payload';
  v_manifest := v_payload->'manifest';
  if coalesce((v_manifest->>'schema_versao')::integer,0)<>1 then
    raise exception 'unsupported_agentetome_schema';
  end if;

  select id into v_source_id
  from public.source_catalog
  where metadata->>'code'='src_agentetome_api'
  limit 1;
  if v_source_id is null then raise exception 'agentetome_source_missing'; end if;

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  v_expires_at := least(
    coalesce((v_payload->>'expira_em')::timestamptz,now()+interval '10 minutes'),
    now()+interval '10 minutes'
  );

  insert into public.agentetome_ingestion_tokens(token_hash,expires_at,metadata)
  values (
    v_token_hash,
    v_expires_at,
    jsonb_build_object(
      'source_id',v_source_id,
      'administrator',trim(p_admin),
      'cut',p_cut,
      'competence',p_competence,
      'format',p_format,
      'schema_version',(v_manifest->>'schema_versao')::integer,
      'manifest',v_manifest,
      'expected_size_bytes',(v_payload->>'tamanho_bytes')::bigint,
      'provider_file_name',v_payload->>'arquivo',
      'provider_expires_at',v_payload->>'expira_em'
    )
  ) returning id into v_token_id;

  v_request_id := net.http_post(
    url := 'https://hdghpmssudrqhsbvrdyt.supabase.co/functions/v1/agentetome-ingest-export',
    body := jsonb_build_object('signedUrl',v_payload->>'link_download'),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Accept','application/json',
      'x-ingestion-token',v_token
    ),
    timeout_milliseconds := 120000
  );

  update public.agentetome_ingestion_tokens
  set metadata=metadata||jsonb_build_object('pg_net_request_id',v_request_id)
  where id=v_token_id;

  return jsonb_build_object(
    'status','queued',
    'provider','agentetome',
    'operation','admin_export_ingestion',
    'pg_net_request_id',v_request_id,
    'token_expires_at',v_expires_at,
    'signed_url_persisted',false
  );
end;
$$;

revoke all on function private.run_agentetome_export_ingestion(text,text,text,text)
  from public, anon, authenticated;
grant execute on function private.run_agentetome_export_ingestion(text,text,text,text)
  to service_role;

drop trigger if exists trg_normalize_agentetome_bronze_record_key
  on public.bronze_historical_records;
drop function if exists private.normalize_agentetome_bronze_record_key();

create function private.normalize_agentetome_bronze_record_key()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.dataset_code like 'agentetome\_%' escape '\' then
    if nullif(new.content_hash,'') is null then
      raise exception 'agentetome_content_hash_required';
    end if;
    if position('|row_sha256=' in new.record_key)=0 then
      new.record_key := new.record_key||'|row_sha256='||new.content_hash;
    end if;
    if tg_op='INSERT' and exists (
      select 1 from public.bronze_historical_records existing
      where existing.dataset_code=new.dataset_code
        and existing.record_key=new.record_key
    ) then
      return null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_agentetome_bronze_record_key()
  from public, anon, authenticated;
grant execute on function private.normalize_agentetome_bronze_record_key()
  to service_role;

create trigger trg_normalize_agentetome_bronze_record_key
before insert or update of record_key, content_hash, payload
on public.bronze_historical_records
for each row
execute function private.normalize_agentetome_bronze_record_key();

create or replace function public.finalize_agentetome_recovered_package(
  p_package_id uuid,
  p_headers jsonb,
  p_row_counts jsonb,
  p_bronze_rows integer,
  p_runtime text default 'agentetome-recover-package-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_package public.agentetome_export_packages%rowtype;
  v_operation_id uuid;
  v_dataset_run_id uuid;
  v_storage_url text;
  v_started_at timestamptz;
begin
  select * into v_package
  from public.agentetome_export_packages
  where id=p_package_id
  for update;
  if not found then raise exception 'agentetome_package_not_found'; end if;
  if v_package.schema_version<>1 then raise exception 'unsupported_agentetome_schema'; end if;
  if p_bronze_rows<0 then raise exception 'invalid_bronze_row_count'; end if;

  if v_package.status='parsed' then
    return jsonb_build_object(
      'status','already_parsed',
      'package_id',v_package.id,
      'operation_run_id',v_package.operation_run_id,
      'connector_run_id',v_package.connector_run_id
    );
  end if;

  v_storage_url := 'storage://'||v_package.storage_bucket||'/'||v_package.storage_path;
  select started_at into v_started_at
  from public.source_connector_runs
  where id=v_package.connector_run_id;
  v_started_at := coalesce(v_started_at,now());

  insert into public.agentetome_operation_runs (
    source_id,operation,status,administrator,competence,format,
    request_fingerprint,response_summary,http_status,duration_ms
  ) values (
    v_package.source_id,
    'admin_export',
    'completed',
    v_package.administrator,
    v_package.competence,
    v_package.format,
    encode(extensions.digest(jsonb_build_object(
      'administrator',v_package.administrator,
      'cut',v_package.cut,
      'competence',v_package.competence,
      'format',v_package.format,
      'package_hash',v_package.content_hash
    )::text,'sha256'),'hex'),
    jsonb_build_object(
      'schema_versao',v_package.schema_version,
      'arquivo',v_package.provider_file_name,
      'formato','zip_de_csvs',
      'tamanho_bytes',v_package.size_bytes,
      'package_hash',v_package.content_hash,
      'storage_bucket',v_package.storage_bucket,
      'storage_path',v_package.storage_path,
      'row_counts',p_row_counts,
      'recovered_from_private_storage',true,
      'raw_download_link_persisted',false,
      'runtime',p_runtime
    ),
    200,
    greatest(0,floor(extract(epoch from (now()-v_started_at))*1000)::integer)
  ) returning id into v_operation_id;

  insert into public.source_documents (
    id,run_id,company_id,source_id,document_type,external_id,
    canonical_url,title,published_at,observed_at,content_hash,
    raw_payload,normalized_payload,extraction_status,confidence_score,
    captured_at,payload_hash,evidence_url,confidence,quality_status
  ) values (
    'agentetome:'||v_package.content_hash,
    v_package.connector_run_id,
    null,
    v_package.source_id,
    'agentetome_admin_export_zip',
    v_package.provider_file_name,
    null,
    'Agentetome export — '||v_package.administrator||' — '||coalesce(v_package.provider_generated_at::date::text,current_date::text),
    v_package.provider_generated_at,
    now(),
    v_package.content_hash,
    jsonb_build_object(
      'provider_file_name',v_package.provider_file_name,
      'size_bytes',v_package.size_bytes,
      'row_counts',p_row_counts,
      'raw_download_link_persisted',false
    ),
    jsonb_build_object(
      'package_id',v_package.id,
      'storage_bucket',v_package.storage_bucket,
      'storage_path',v_package.storage_path,
      'row_counts',p_row_counts,
      'headers',p_headers,
      'schema_version',v_package.schema_version,
      'recovered_from_private_storage',true
    ),
    'parsed',0.78,now(),v_package.content_hash,v_storage_url,0.78,'validated'
  )
  on conflict (id) do update set
    run_id=excluded.run_id,
    source_id=excluded.source_id,
    observed_at=excluded.observed_at,
    raw_payload=excluded.raw_payload,
    normalized_payload=excluded.normalized_payload,
    extraction_status=excluded.extraction_status,
    captured_at=excluded.captured_at,
    evidence_url=excluded.evidence_url,
    quality_status=excluded.quality_status;

  select id into v_dataset_run_id
  from public.capital_market_dataset_runs
  where dataset_code='agentetome_admin_export_v1'
    and metadata->>'package_id'=v_package.id::text
  order by created_at desc
  limit 1;

  if v_dataset_run_id is null then
    insert into public.capital_market_dataset_runs (
      dataset_code,source_id,trigger_type,status,started_at,finished_at,
      files_processed,records_seen,bronze_rows_written,events_written,
      signals_written,error_message,metadata,resources_skipped,
      records_inserted,records_updated,records_unchanged
    ) values (
      'agentetome_admin_export_v1',
      v_package.source_id,
      'private_storage_recovery',
      'completed',
      v_started_at,
      now(),
      v_package.file_count,
      p_bronze_rows,
      p_bronze_rows,
      0,
      0,
      null,
      jsonb_build_object(
        'package_id',v_package.id,
        'package_hash',v_package.content_hash,
        'administrator',v_package.administrator,
        'schema_version',v_package.schema_version,
        'row_counts',p_row_counts,
        'write_mode','idempotent_upsert',
        'recovered_from_private_storage',true,
        'runtime',p_runtime
      ),
      0,p_bronze_rows,0,0
    ) returning id into v_dataset_run_id;
  end if;

  update public.agentetome_export_packages
  set
    operation_run_id=v_operation_id,
    headers=coalesce(p_headers,'{}'::jsonb),
    row_counts=coalesce(p_row_counts,row_counts),
    status='parsed',
    metadata=metadata||jsonb_build_object(
      'quarantined',false,
      'recovered_from_private_storage',true,
      'recovered_at',now(),
      'runtime',p_runtime,
      'raw_download_link_persisted',false
    ),
    updated_at=now()
  where id=v_package.id;

  update public.source_connector_runs
  set
    status='completed',
    finished_at=now(),
    items_collected=p_bronze_rows,
    outputs_written=v_package.file_count+1,
    signals_written=0,
    enrichments_written=0,
    error_message=null,
    metadata=metadata||jsonb_build_object(
      'package_id',v_package.id,
      'package_hash',v_package.content_hash,
      'storage_path',v_package.storage_path,
      'row_counts',p_row_counts,
      'schema_version',v_package.schema_version,
      'recovered_from_private_storage',true,
      'runtime',p_runtime
    )
  where id=v_package.connector_run_id;

  return jsonb_build_object(
    'status','completed',
    'package_id',v_package.id,
    'operation_run_id',v_operation_id,
    'connector_run_id',v_package.connector_run_id,
    'dataset_run_id',v_dataset_run_id,
    'bronze_rows',p_bronze_rows,
    'storage_url',v_storage_url
  );
end;
$$;

revoke all on function public.finalize_agentetome_recovered_package(uuid,jsonb,jsonb,integer,text)
  from public, anon, authenticated;
grant execute on function public.finalize_agentetome_recovered_package(uuid,jsonb,jsonb,integer,text)
  to service_role;

create or replace function private.queue_agentetome_package_recovery(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, net, private
as $$
declare
  v_package public.agentetome_export_packages%rowtype;
  v_token text;
  v_token_hash text;
  v_request_id bigint;
begin
  select * into v_package
  from public.agentetome_export_packages
  where id=p_package_id;
  if not found then raise exception 'agentetome_package_not_found'; end if;
  if v_package.status='parsed' then
    return jsonb_build_object('status','already_parsed','package_id',p_package_id);
  end if;

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_token_hash := encode(extensions.digest(v_token,'sha256'),'hex');
  insert into public.agentetome_ingestion_tokens(token_hash,expires_at,metadata)
  values (
    v_token_hash,
    now()+interval '10 minutes',
    jsonb_build_object('package_id',p_package_id,'mode','private_storage_recovery')
  );

  v_request_id := net.http_post(
    url := 'https://hdghpmssudrqhsbvrdyt.supabase.co/functions/v1/agentetome-recover-package',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Accept','application/json',
      'x-ingestion-token',v_token
    ),
    timeout_milliseconds := 120000
  );

  return jsonb_build_object(
    'status','queued',
    'package_id',p_package_id,
    'pg_net_request_id',v_request_id,
    'signed_url_persisted',false
  );
end;
$$;

revoke all on function private.queue_agentetome_package_recovery(uuid)
  from public, anon, authenticated;
grant execute on function private.queue_agentetome_package_recovery(uuid)
  to service_role;

create index if not exists capital_market_events_agentetome_fidc_lookup_idx
  on public.capital_market_events (dataset_code,fund_cnpj,reference_date desc)
  where dataset_code='agentetome_fidc_consolidado_v1';

create or replace view public.agentetome_fidc_market_map_v1
with (security_invoker=true)
as
select
  e.id as event_id,
  e.fund_cnpj,
  e.fund_name,
  e.reference_date,
  e.event_date as delivered_at,
  e.status as delivery_status,
  e.volume as nav,
  case when e.normalized_payload->>'portfolio' ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (e.normalized_payload->>'portfolio')::numeric end as portfolio,
  case when e.normalized_payload->>'delinquencyTotal' ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (e.normalized_payload->>'delinquencyTotal')::numeric end as delinquency_total,
  case when e.normalized_payload->>'delinquencyToNav' ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (e.normalized_payload->>'delinquencyToNav')::numeric end as delinquency_to_nav,
  case when e.normalized_payload->>'pdd' ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (e.normalized_payload->>'pdd')::numeric end as pdd,
  case when e.normalized_payload->>'subordinationPct' ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (e.normalized_payload->>'subordinationPct')::numeric end as subordination_pct,
  case when e.normalized_payload->>'investors' ~ '^-?[0-9]+$'
    then (e.normalized_payload->>'investors')::integer end as investors,
  e.normalized_payload->>'administratorCnpj' as administrator_cnpj,
  e.normalized_payload->>'administratorName' as administrator_name,
  e.normalized_payload->>'manager' as manager_name,
  e.normalized_payload->>'custodian' as custodian_name,
  e.normalized_payload#>>'{operationalQuality,silenceStatus}' as silence_status,
  case when e.normalized_payload#>>'{operationalQuality,monthsWithoutReport}' ~ '^-?[0-9]+$'
    then (e.normalized_payload#>>'{operationalQuality,monthsWithoutReport}')::integer end as months_without_report,
  case when e.normalized_payload#>>'{operationalQuality,delays12m}' ~ '^-?[0-9]+$'
    then (e.normalized_payload#>>'{operationalQuality,delays12m}')::integer end as delays_12m,
  case when e.normalized_payload#>>'{operationalQuality,reFilings12m}' ~ '^-?[0-9]+$'
    then (e.normalized_payload#>>'{operationalQuality,reFilings12m}')::integer end as refilings_12m,
  case when e.normalized_payload->>'currentViolations' ~ '^-?[0-9]+$'
    then (e.normalized_payload->>'currentViolations')::integer end as current_violations,
  e.normalized_payload#>>'{companyResolution,status}' as company_resolution_status,
  e.issuer_company_id,
  e.source_url,
  e.content_hash,
  e.observed_at,
  e.updated_at
from public.capital_market_events e
where e.dataset_code='agentetome_fidc_consolidado_v1'
  and e.instrument_type='FIDC';

revoke all on public.agentetome_fidc_market_map_v1 from public, anon, authenticated;
grant select on public.agentetome_fidc_market_map_v1 to service_role;

comment on view public.agentetome_fidc_market_map_v1 is
  'Silver FIDC market map sourced from Agentetome/CVM-FNET. Service-role only until exposed by an authenticated backend endpoint.';

notify pgrst, 'reload schema';
