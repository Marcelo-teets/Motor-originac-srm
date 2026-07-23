-- Agentetome API / MCP integration.
-- Source registration plus a privacy-preserving operation audit. The API key,
-- raw XML and temporary signed download links are never persisted.

insert into public.source_catalog (
  name,
  url,
  category,
  scope,
  priority,
  criticality,
  frequency,
  status,
  validation_rule,
  metadata,
  source_type,
  auth_requirement,
  rate_limit_notes,
  health,
  updated_at
)
values (
  'Agente Tomé API / MCP',
  'https://www.agentetome.com/api',
  'funds_structured_data',
  'BR',
  1,
  'high',
  'monthly_and_on_demand',
  'partial',
  'Aceitar somente respostas autenticadas; preservar informe_id/competencia/CNPJ quando disponíveis; validar manifest.schema_versao; não persistir XML bruto nem links temporários de export; tratar CVM/FNET como fonte oficial e Tomé como camada de normalização suplementar.',
  jsonb_build_object(
    'code', 'src_agentetome_api',
    'provider', 'agentetome',
    'tier', 'tier_5_supplemental_enrichment',
    'baseUrl', 'https://www.agentetome.com',
    'docsUrl', 'https://agentetome.com/docs/api',
    'mcpUrl', 'https://www.agentetome.com/api/mcp',
    'apiVersion', 'v1',
    'schemaVersion', 1,
    'officialUnderlyingSources', jsonb_build_array('CVM', 'FNET'),
    'capabilities', jsonb_build_array('validate_fidc_xml', 'export_admin_funds', 'admin_manifest'),
    'coverage', jsonb_build_array('FIDC', 'FII', 'ICVM_555'),
    'captureMode', 'bearer_rest_or_http_mcp',
    'secretEnv', 'AGENTETOME_API_KEY',
    'implementedRuntime', false,
    'runtimeCodeReady', true,
    'implementationPhase', 'catalog_registered_runtime_pending_secret_and_connector_deploy',
    'sourceConfidenceCap', 0.78,
    'auditTable', 'agentetome_operation_runs',
    'privacy', jsonb_build_object(
      'persistRawXml', false,
      'persistSignedDownloadLinks', false,
      'providerDiscardsXml', true
    ),
    'rateLimits', jsonb_build_object(
      'xmlValidationPerMinute', 30,
      'adminExportsPerHour', 10,
      'honorRetryAfter', true
    ),
    'useCases', jsonb_build_array(
      'FIDC operational due diligence',
      'administrator and fund market map',
      'fund comparables and aging analysis',
      'pre-submission XML quality control'
    )
  ),
  'token_api_mcp',
  'Authorization: Bearer AGENTETOME_API_KEY',
  'Validação XML: 30/min. Export por administradora: 10/h. Honrar Retry-After; cache diário não consome nova geração para o mesmo pedido.',
  'degraded',
  now()
)
on conflict ((metadata ->> 'code')) where coalesce(metadata ->> 'code', '') <> ''
do update set
  name = excluded.name,
  url = excluded.url,
  category = excluded.category,
  scope = excluded.scope,
  priority = excluded.priority,
  criticality = excluded.criticality,
  frequency = excluded.frequency,
  status = excluded.status,
  validation_rule = excluded.validation_rule,
  metadata = public.source_catalog.metadata || excluded.metadata,
  source_type = excluded.source_type,
  auth_requirement = excluded.auth_requirement,
  rate_limit_notes = excluded.rate_limit_notes,
  health = excluded.health,
  updated_at = now();

create table if not exists public.agentetome_operation_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.source_catalog(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('validate_fidc_xml', 'admin_manifest', 'admin_export')),
  status text not null check (status in ('completed', 'partial', 'failed', 'blocked')),
  administrator text,
  competence text,
  format text,
  request_fingerprint text,
  response_summary jsonb not null default '{}'::jsonb,
  http_status integer,
  retry_after_seconds integer,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists agentetome_operation_runs_created_at_idx
  on public.agentetome_operation_runs (created_at desc);

create index if not exists agentetome_operation_runs_admin_competence_idx
  on public.agentetome_operation_runs (administrator, competence, created_at desc)
  where administrator is not null;

alter table public.agentetome_operation_runs enable row level security;

revoke all on table public.agentetome_operation_runs from anon, authenticated;
grant all on table public.agentetome_operation_runs to service_role;
