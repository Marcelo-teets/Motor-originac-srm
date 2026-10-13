-- F2-02: first-party CVM assignor identity queue. No new source rows, no automatic
-- company promotion, and no repeat of the large FIDC bronze. One read-only view
-- keyed by checksum-valid 14-digit CNPJ with source lineage back to Tab I.
-- security_invoker prevents the view owner from bypassing underlying table RLS.
create or replace view public.fidc_assignor_identity_queue_v5
with (security_invoker = true, security_barrier = true)
as
with verified_source as (
  select
    l.entity_cnpj as cnpj,
    e.fund_cnpj,
    e.reference_date,
    e.source_url,
    e.source_file_name,
    l.observed_at
  from public.capital_market_entity_links l
  inner join public.capital_market_events e
    on e.dataset_code = l.dataset_code
   and e.record_key = l.record_key
  where l.dataset_code = 'cvm_fidc_monthly'
    and l.entity_role = 'assignor'
    and l.is_primary_origination_target = true
    and l.entity_cnpj ~ '^[0-9]{14}$'
    and public.is_valid_cnpj_checksum(l.entity_cnpj)
    and e.source_file_name ~* 'inf[_ -]?mensal[_ -]?fidc[_ -]?tab[_ -]?i[_ -]'
), grouped as (
  select
    cnpj,
    count(*)::integer as evidence_links,
    count(distinct fund_cnpj)::integer as distinct_funds,
    max(reference_date) as latest_reference_date,
    max(observed_at) as latest_observed_at,
    min(source_url) as evidence_url,
    min(source_file_name) as evidence_file
  from verified_source
  group by cnpj
)
select
  g.cnpj,
  g.evidence_links,
  g.distinct_funds,
  g.latest_reference_date,
  g.latest_observed_at,
  g.evidence_url,
  g.evidence_file,
  exists (
    select 1 from public.companies c where c.cnpj = g.cnpj
  ) as already_company,
  exists (
    select 1 from public.discovered_company_candidates d where d.cnpj = g.cnpj
  ) as already_candidate,
  case
    when exists (select 1 from public.companies c where c.cnpj = g.cnpj)
      then 'linked_company'
    when exists (select 1 from public.discovered_company_candidates d where d.cnpj = g.cnpj)
      then 'candidate_identity_review'
    else 'needs_registry_identity'
  end as identity_next_step
from grouped g;

-- Do not publish potentially sensitive candidate/identity data through anon.
revoke all on public.fidc_assignor_identity_queue_v5 from public, anonymous, authenticated;
grant select on public.fidc_assignor_identity_queue_v5 to neondb_owner;
