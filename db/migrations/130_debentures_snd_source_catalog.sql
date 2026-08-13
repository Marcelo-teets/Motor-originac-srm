-- Govern Debentures.com.br / SND inside the existing capital-market runtime.
insert into public.source_catalog (
  name, url, category, scope, priority, criticality, frequency, status,
  validation_rule, metadata, source_type, auth_requirement, rate_limit_notes, health, updated_at
)
values (
  'Debentures.com.br · SND - Debêntures Públicas',
  'https://www.debentures.com.br/',
  'regulatory','BR',1,'high','daily','active',
  'Bulk snapshot must contain the SND registered-public-debentures header, valid issuer CNPJ and at least one data row.',
  jsonb_build_object(
    'code','src_debentures_snd','datasetCode','debentures_snd','owner','ANBIMA/SND',
    'captureMode','bulk_registered_snapshot','connectorVersion','debentures_snd_v1',
    'sourceAuthority','primary_market_infrastructure_legacy','confidence',0.99,
    'decommissionRisk',true,'migrationTarget','ANBIMA Data',
    'crossValidationSources',jsonb_build_array('src_cvm_offers','src_anbima_fundos_estruturados'),
    'evidencePolicy','observed_only','storagePolicy','hot_current_cold_historical'
  ),
  'public_bulk','anonymous','One deterministic bulk snapshot per scheduled run; no page-by-page scraping.','healthy',now()
)
on conflict (name,url) do update set
  category=excluded.category,scope=excluded.scope,priority=excluded.priority,
  criticality=excluded.criticality,frequency=excluded.frequency,status=excluded.status,
  validation_rule=excluded.validation_rule,
  metadata=coalesce(public.source_catalog.metadata,'{}'::jsonb)||excluded.metadata,
  source_type=excluded.source_type,auth_requirement=excluded.auth_requirement,
  rate_limit_notes=excluded.rate_limit_notes,health=excluded.health,updated_at=now();

insert into public.source_schedule_registry (
  source_id,runner,cadence,cron_utc,workflow_file,enabled,max_rows,timezone,notes,metadata,updated_at
)
select id,'capital_market','daily','0 14 * * *','.github/workflows/capital-market-ingestion.yml',true,10000,'UTC',
  'Daily SND snapshot; checkpoint hash prevents no-op rewrites.',
  jsonb_build_object('datasetCode','debentures_snd','triggerType','schedule','fallbackFamily','CVM/ANBIMA'),now()
from public.source_catalog where metadata->>'code'='src_debentures_snd'
on conflict (source_id) do update set
  runner=excluded.runner,cadence=excluded.cadence,cron_utc=excluded.cron_utc,
  workflow_file=excluded.workflow_file,enabled=excluded.enabled,max_rows=excluded.max_rows,
  timezone=excluded.timezone,notes=excluded.notes,metadata=excluded.metadata,updated_at=now();
