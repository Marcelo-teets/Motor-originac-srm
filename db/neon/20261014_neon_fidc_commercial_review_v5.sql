-- V5 M2/A2: zero-copy human review of CVM FIDC assignor registry identities.
-- Evidence is NOT a credit score, ICP acceptance, nor company promotion.
-- Derive from the existing checksum-verified, source-traced identity view.
create or replace view public.fidc_assignor_commercial_review_v5
with (security_invoker = true, security_barrier = true)
as
select
  q.cnpj,
  substring(q.cnpj from 1 for 8) as cnpj_root,
  count(*) over (partition by substring(q.cnpj from 1 for 8))::integer
    as establishments_in_cvm_queue,
  q.registry_legal_name as legal_name,
  q.registry_trade_name as trade_name,
  q.registry_status as registration_status,
  q.registry_provider,
  q.registry_url,
  q.registry_checked_at,
  q.evidence_url as cvm_evidence_url,
  q.evidence_file as cvm_evidence_file,
  q.latest_reference_date as cvm_reference_date,
  q.distinct_funds,
  q.evidence_links,
  q.already_company,
  q.already_candidate,
  case
    when q.registry_legal_name is null then 'registry_lookup_pending'
    when upper(trim(coalesce(q.registry_status, ''))) in
      ('INAPTA','BAIXADA','SUSPENSA','NULA') then 'registration_exception_review'
    when upper(q.registry_legal_name) ~
      '(BANCO|SECURITIZADORA|SOCIEDADE DE CR[EÉ]DITO|FUNDO DE INVESTIMENTO|ADMINISTRADORA DE FUNDOS|GESTORA DE RECURSOS|CORRETORA DE T[IÍ]TULOS|DISTRIBUIDORA DE T[IÍ]TULOS)'
      then 'regulated_entity_review'
    else 'business_model_due_diligence'
  end as review_lane,
  case
    when q.registry_legal_name is null then 'Resolve legal identity from registry'
    when upper(trim(coalesce(q.registry_status, ''))) in
      ('INAPTA','BAIXADA','SUSPENSA','NULA') then 'Verify registry exception before any commercial review'
    when upper(q.registry_legal_name) ~
      '(BANCO|SECURITIZADORA|SOCIEDADE DE CR[EÉ]DITO|FUNDO DE INVESTIMENTO|ADMINISTRADORA DE FUNDOS|GESTORA DE RECURSOS|CORRETORA DE T[IÍ]TULOS|DISTRIBUIDORA DE T[IÍ]TULOS)'
      then 'Human no-go review: regulated role inferred only from legal name'
    else 'Verify sector, tech fit, scale, receivables, credit product, funding gap and timing'
  end as recommended_review_action,
  'unverified'::text as icp_eligibility_status,
  'unknown'::text as receivables_structurability_status,
  'unknown'::text as funding_gap_status,
  false as auto_promotion_authorized
from public.fidc_assignor_identity_queue_v5 q;

revoke all on public.fidc_assignor_commercial_review_v5
  from public, anonymous, authenticated;
grant select on public.fidc_assignor_commercial_review_v5 to neondb_owner;
