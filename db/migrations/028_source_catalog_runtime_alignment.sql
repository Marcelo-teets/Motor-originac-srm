-- Mirror-only lineage for the live source_catalog runtime alignment.
--
-- Already applied in Supabase via MCP through lineage including:
--   20260529235515 source_catalog_runtime_alignment
--   20260530024902 RSS expansion
--   20260528213333 security/performance hardening phase 2
--   20260529164843 security/performance hardening phase 2 follow-up
--
-- Keep this file for repository parity. Do not use it to re-run production DDL.
-- Statements are intentionally idempotent and mirror the live 17-column shape.

create table if not exists public.source_catalog (
  id uuid primary key default gen_random_uuid(),
  name text,
  url text,
  category text,
  scope text,
  priority int,
  criticality text,
  frequency text,
  status text,
  validation_rule text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_type text,
  auth_requirement text,
  rate_limit_notes text,
  health text
);

create index if not exists idx_source_catalog_status
  on public.source_catalog(status);

create index if not exists idx_source_catalog_health
  on public.source_catalog(health);

create index if not exists idx_source_catalog_priority
  on public.source_catalog(priority);

create index if not exists idx_source_catalog_category_scope
  on public.source_catalog(category, scope);

comment on table public.source_catalog is
  'Mirror-only: live source catalog runtime contract applied via Supabase MCP.';
comment on column public.source_catalog.id is 'Live UUID primary key.';
comment on column public.source_catalog.name is 'Human-readable source name.';
comment on column public.source_catalog.url is 'Source URL, endpoint, feed, or landing page when available.';
comment on column public.source_catalog.category is 'Source category used by runtime grouping.';
comment on column public.source_catalog.scope is 'Operational scope/tier covered by the source.';
comment on column public.source_catalog.priority is 'Integer priority used for runtime ordering.';
comment on column public.source_catalog.criticality is 'Operational criticality for monitoring and fallback decisions.';
comment on column public.source_catalog.frequency is 'Expected refresh/check cadence.';
comment on column public.source_catalog.status is 'Implementation/runtime status.';
comment on column public.source_catalog.validation_rule is 'Validation rule or health-check contract.';
comment on column public.source_catalog.metadata is 'Source-specific runtime metadata.';
comment on column public.source_catalog.source_type is 'Source type such as api, rss, sitemap, scraper, or manual.';
comment on column public.source_catalog.auth_requirement is 'Authentication requirement for the source.';
comment on column public.source_catalog.rate_limit_notes is 'Operational notes for limits, quotas, and backoff.';
comment on column public.source_catalog.health is 'Current source health classification.';
