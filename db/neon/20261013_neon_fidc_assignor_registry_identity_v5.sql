-- V5 M1: minimal verified-registry identity cache for CVM FIDC assignors.
-- No candidate/company promotion; raw CVM evidence stays in the zero-copy view.
create table if not exists public.fidc_assignor_registry_identities (
  cnpj text primary key check (
    cnpj ~ '^[0-9]{14}$' and public.is_valid_cnpj_checksum(cnpj)
  ),
  legal_name text not null check (length(trim(legal_name)) >= 3),
  trade_name text,
  registration_status text,
  municipality text,
  state_code text,
  registry_provider text not null check (registry_provider = 'brasilapi_receita_proxy'),
  registry_url text not null check (registry_url like 'https://brasilapi.com.br/api/cnpj/v1/%'),
  registry_checked_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.fidc_assignor_registry_identities enable row level security;
revoke all on public.fidc_assignor_registry_identities from public, anonymous, authenticated;
grant select, insert, update on public.fidc_assignor_registry_identities to neondb_owner;

-- Append registry attributes without replacing the source view's semantics.
-- The registry is a corroborating proxy source, not an official company promotion.
create or replace view public.fidc_assignor_identity_queue_v5
with (security_invoker = true, security_barrier = true)
as
with verified_source as (
  select l.entity_cnpj as cnpj, e.fund_cnpj, e.reference_date,
    e.source_url, e.source_file_name, l.observed_at
  from public.capital_market_entity_links l
  join public.capital_market_events e
    on e.dataset_code = l.dataset_code and e.record_key = l.record_key
  where l.dataset_code = 'cvm_fidc_monthly'
    and l.entity_role = 'assignor'
    and l.is_primary_origination_target = true
    and l.entity_cnpj ~ '^[0-9]{14}$'
    and public.is_valid_cnpj_checksum(l.entity_cnpj)
    and e.source_file_name ~* 'inf[_ -]?mensal[_ -]?fidc[_ -]?tab[_ -]?i[_ -]'
), grouped as (
  select cnpj, count(*)::integer as evidence_links,
    count(distinct fund_cnpj)::integer as distinct_funds,
    max(reference_date) as latest_reference_date,
    max(observed_at) as latest_observed_at,
    min(source_url) as evidence_url,
    min(source_file_name) as evidence_file
  from verified_source group by cnpj
)
select g.cnpj, g.evidence_links, g.distinct_funds, g.latest_reference_date,
  g.latest_observed_at, g.evidence_url, g.evidence_file,
  exists (select 1 from public.companies c where c.cnpj = g.cnpj) as already_company,
  exists (select 1 from public.discovered_company_candidates d where d.cnpj = g.cnpj) as already_candidate,
  case
    when exists (select 1 from public.companies c where c.cnpj = g.cnpj) then 'linked_company'
    when exists (select 1 from public.discovered_company_candidates d where d.cnpj = g.cnpj) then 'candidate_identity_review'
    else 'needs_registry_identity'
  end as identity_next_step,
  r.legal_name as registry_legal_name,
  r.trade_name as registry_trade_name,
  r.registration_status as registry_status,
  r.registry_provider,
  r.registry_url,
  r.registry_checked_at,
  case
    when r.cnpj is not null then 'registry_identity_review_required'
    else 'registry_lookup_required'
  end as registry_review_stage
from grouped g
left join public.fidc_assignor_registry_identities r on r.cnpj = g.cnpj;

revoke all on public.fidc_assignor_identity_queue_v5 from public, anonymous, authenticated;
grant select on public.fidc_assignor_identity_queue_v5 to neondb_owner;
