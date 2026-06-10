-- Aplicada no banco vivo via Supabase MCP em 2026-06-10 (versão 2026xxxx connector_usage_budget_guard). Espelho de linhagem — não reexecutar.
create table if not exists public.connector_usage_budgets (
  id uuid primary key default gen_random_uuid(),
  connector_code text not null,
  period_month text not null,
  monthly_budget integer not null default 500,
  used_requests integer not null default 0,
  reserved_requests integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connector_code, period_month),
  check (monthly_budget >= 0),
  check (used_requests >= 0),
  check (reserved_requests >= 0),
  check (used_requests <= monthly_budget),
  check (reserved_requests <= monthly_budget)
);

create table if not exists public.connector_usage_events (
  id uuid primary key default gen_random_uuid(),
  connector_code text not null,
  period_month text not null,
  event_type text not null,
  request_cost integer not null default 1,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (request_cost >= 0)
);

create index if not exists idx_connector_usage_budgets_connector_period
  on public.connector_usage_budgets(connector_code, period_month);

create index if not exists idx_connector_usage_events_connector_period
  on public.connector_usage_events(connector_code, period_month, created_at desc);

create index if not exists idx_connector_usage_events_status
  on public.connector_usage_events(status, created_at desc);

alter table if exists public.connector_usage_budgets enable row level security;
alter table if exists public.connector_usage_events enable row level security;

create policy srv_all_connector_usage_budgets on public.connector_usage_budgets
  as permissive for all to service_role using (true) with check (true);
create policy srv_all_connector_usage_events on public.connector_usage_events
  as permissive for all to service_role using (true) with check (true);
create policy authenticated_select_connector_usage_budgets on public.connector_usage_budgets
  as permissive for select to authenticated using (true);
create policy authenticated_select_connector_usage_events on public.connector_usage_events
  as permissive for select to authenticated using (true);
