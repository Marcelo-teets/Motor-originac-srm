-- Paperclip control plane inside the official stack: Vercel API -> Motor services -> Supabase.
-- No parallel sidecar, no external orchestrator state.

create table if not exists public.paperclip_commands (
  id uuid primary key default gen_random_uuid(),
  target text not null default 'paper_clip' check (target in ('paper_clip','aba','adm')),
  action text not null,
  company_id uuid references public.companies(id) on delete set null,
  requested_by uuid,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_paperclip_commands_status_created
  on public.paperclip_commands(status, created_at desc);
create index if not exists idx_paperclip_commands_company_created
  on public.paperclip_commands(company_id, created_at desc)
  where company_id is not null;

alter table public.paperclip_commands enable row level security;
drop policy if exists paperclip_commands_read_authenticated on public.paperclip_commands;
create policy paperclip_commands_read_authenticated
  on public.paperclip_commands for select to authenticated using (true);
grant select on public.paperclip_commands to authenticated;
grant all on public.paperclip_commands to service_role;

create or replace view public.paperclip_status_v
with (security_invoker = true)
as
select
  count(*)::integer as command_count,
  count(*) filter (where status='queued')::integer as queued,
  count(*) filter (where status='running')::integer as running,
  count(*) filter (where status='completed')::integer as completed,
  count(*) filter (where status='failed')::integer as failed,
  max(created_at) as last_command_at,
  max(finished_at) filter (where status='completed') as last_completed_at
from public.paperclip_commands;

grant select on public.paperclip_status_v to authenticated, service_role;

comment on table public.paperclip_commands is
  'Audit trail for Paperclip/ABA/ADM control-plane commands. Paperclip coordinates; canonical Motor services execute; Supabase persists.';
