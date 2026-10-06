-- Neon compatibility for Knowledge Vault execution over the canonical CRM tables.
-- Separate migration key because the earlier pipeline compatibility migration may already be recorded as applied.

alter table if exists public.pipeline
  add column if not exists owner_name text,
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
