-- Neon compatibility for the canonical CRM surfaces used by Knowledge Vault and origination runtime.
-- Idempotent by design: only adds columns missing from existing runtime tables.

alter table if exists public.pipeline
  add column if not exists status text not null default 'active',
  add column if not exists priority text,
  add column if not exists owner_name text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists expected_structure text,
  add column if not exists expected_ticket numeric(18,2),
  add column if not exists last_contact_at timestamptz;

alter table if exists public.activities
  add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists owner_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.tasks
  add column if not exists pipeline_id uuid references public.pipeline(id) on delete set null,
  add column if not exists owner_name text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.pipeline.status is
  'Operational status for the canonical origination pipeline.';

comment on column public.pipeline.priority is
  'Commercial/origination priority used by ranking, Knowledge Vault and execution workflows.';
