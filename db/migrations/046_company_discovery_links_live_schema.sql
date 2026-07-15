-- Restore promotion lineage for the Capture Inbox using the current UUID schema.
-- The historical migration used text company IDs and was not applied to the live project.

create table if not exists public.company_discovery_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  discovered_candidate_id uuid not null references public.discovered_company_candidates(id) on delete cascade,
  match_method text not null default 'manual_promotion',
  confidence numeric(5,4) not null default 0.7000,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_discovery_links_confidence_check
    check (confidence >= 0 and confidence <= 1),
  constraint company_discovery_links_company_candidate_unique
    unique(company_id, discovered_candidate_id)
);

create index if not exists idx_company_discovery_links_company
  on public.company_discovery_links(company_id, created_at desc);

create index if not exists idx_company_discovery_links_candidate
  on public.company_discovery_links(discovered_candidate_id, created_at desc);

alter table public.company_discovery_links enable row level security;

drop policy if exists service_role_all_company_discovery_links
  on public.company_discovery_links;
create policy service_role_all_company_discovery_links
  on public.company_discovery_links
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists authenticated_select_company_discovery_links
  on public.company_discovery_links;
create policy authenticated_select_company_discovery_links
  on public.company_discovery_links
  for select
  to authenticated
  using (true);

grant all on public.company_discovery_links to service_role;
grant select on public.company_discovery_links to authenticated;

comment on table public.company_discovery_links is
  'Rastreabilidade entre candidatos promovidos do Capture Inbox e a empresa canônica correspondente.';
comment on column public.company_discovery_links.match_method is
  'Método que originou o vínculo, como manual_promotion, cnpj_exact ou domain_exact.';
