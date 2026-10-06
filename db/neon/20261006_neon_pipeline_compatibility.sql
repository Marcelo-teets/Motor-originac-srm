-- Neon compatibility for the canonical CRM pipeline surface used by Knowledge Vault and origination runtime.
-- Idempotent by design: it only adds columns missing from the existing pipeline table.

alter table if exists public.pipeline
  add column if not exists status text not null default 'active',
  add column if not exists priority text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists expected_structure text,
  add column if not exists expected_ticket numeric(18,2);

comment on column public.pipeline.status is
  'Operational status for the canonical origination pipeline.';

comment on column public.pipeline.priority is
  'Commercial/origination priority used by ranking, Knowledge Vault and execution workflows.';
