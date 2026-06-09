-- Mirror-only Data Platform Fase 2 / Frente D.
-- Apply separately through Supabase MCP. Codex did not execute this DDL.
-- Purpose: consolidate connector run diagnostics and source-code matching without changing serverless entrypoints.

create index if not exists idx_source_connector_runs_source_started
  on public.source_connector_runs(source_id, started_at desc);

create index if not exists idx_source_connector_runs_metadata_source_code
  on public.source_connector_runs((metadata->>'sourceCode'), started_at desc)
  where metadata ? 'sourceCode';

create index if not exists idx_source_connector_runs_metadata_source_codes
  on public.source_connector_runs using gin ((metadata->'sourceCodes'))
  where metadata ? 'sourceCodes';

create or replace view public.gold_source_connector_run_diagnostics as
select
  scr.id,
  scr.company_id,
  regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') as canonical_cnpj,
  scr.source_id,
  coalesce(sc.metadata->>'code', scr.metadata->>'sourceCode', scr.source_id::text) as source_code,
  coalesce(sc.metadata->>'tier', 'tier_5') as source_tier,
  scr.scope_type,
  scr.trigger_type,
  scr.status,
  scr.started_at,
  scr.finished_at,
  scr.items_collected,
  scr.outputs_written,
  scr.signals_written,
  scr.enrichments_written,
  scr.error_message,
  scr.metadata,
  case
    when scr.status in ('completed', 'real') and scr.outputs_written > 0 then 'operational'
    when scr.status in ('partial', 'queued', 'running') then 'partial'
    when scr.status = 'failed' then 'failed'
    else 'needs_review'
  end as operational_status
from public.source_connector_runs scr
left join public.companies c on c.id = scr.company_id
left join public.source_catalog sc on sc.id = scr.source_id;

comment on view public.gold_source_connector_run_diagnostics is
  'Gold connector diagnostics: source-code aware run lineage for Source Health and capture operations.';
