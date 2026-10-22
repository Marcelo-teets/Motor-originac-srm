-- A2 source-backed discovery, observed 2026-10-22.
-- Primary contract: https://jeitto.com.br/terms/termos-e-condicoes-de-uso
-- Official 2026 terms identify JEITTO SOLUÇÕES DIGITAIS LTDA and CNPJ 20.937.849/0001-01.
-- Chapter 7 describes personal loans documented by CCB; the title may be
-- issued to Jeitto, a partner financial institution or an assignee.
-- Existence of CCB product does NOT prove that this entity owns the portfolio.
-- Pending identity + human/legal/commercial review only. Not a Gold-company approval.
with source_document as (
 select
   '20937849000101'::text as cnpj,
   'Jeitto'::text as company_name,
   'JEITTO SOLUÇÕES DIGITAIS LTDA.'::text as legal_name,
   'https://jeitto.com.br/terms/termos-e-condicoes-de-uso'::text as source_url
)
insert into public.discovered_company_candidates (
  search_profile_id, company_name, legal_name, cnpj, cnpj_valid,
  website, normalized_domain, geography, segment, subsegment,
  company_type, candidate_role, credit_product, target_structure,
  source_ref, source_url, evidence_summary, receivables, confidence,
  candidate_status, dedupe_key, raw_payload, metadata
)
select
  'sp_fintech_credit_receivables', s.company_name, s.legal_name, s.cnpj,
  null, -- format/checksum only; do not impersonate an RFB live verification
  'https://jeitto.com.br/', 'jeitto.com.br', 'Brasil',
  'Fintech / Serviços Financeiros', 'Crédito pessoal / CCB',
  'Plataforma digital e correspondente bancário',
  'operating_company',
  'Termos oficiais descrevem crédito pessoal por CCB com credor variável',
  null,
  'first-party-contract:' || s.cnpj,
  s.source_url,
  'Termo oficial (jan/2026), capítulos 1, 2 e 7, identifica a entidade e '
    || 'formalização de empréstimo pessoal por CCB. O credor pode ser Jeitto, '
    || 'instituição parceira ou cessionária. A titularidade, o saldo de '
    || 'carteira e a necessidade de funding não estão comprovados.',
  '[]'::jsonb,
  0.70, 'captured', 'first-party:cnpj:' || s.cnpj,
  jsonb_build_object(
    'origin', 'official_company_contract',
    'candidate_role', 'operating_company',
    'commercial_queue', false,
    'human_identity_review_required', true,
    'identity_review_status', 'pending',
    'humanApprovalRequired', true,
    'companyMasterPromotionAuthorized', false,
    'evidenceType', 'first_party_contract',
    'evidenceObservedOn', '2026-10-22',
    'contractVersion', 'Janeiro/2026',
    'legalCnpjSource', s.source_url,
    'economicRoleObserved', 'digital_originator_and_credit_correspondent',
    'separateDistributorOriginator', true,
    'creditProductObserved', true,
    'receivablesStructurability', 'unknown',
    'portfolioOwnership', 'unknown',
    'fundingGap', 'unknown',
    'ticketFit', 'unknown',
    'whyNow', 'unknown',
    'nextDiligence', 'Conciliar credor de cada CCB, titularidade, cessões, loantape, funding e perdas; verificar CNPJ/BCB e tamanho elegível'
  ),
  jsonb_build_object(
    'researchCohort', 'fidc_dcm_first_party_credit_v5',
    'researchDate', '2026-10-22',
    'sourceUrl', s.source_url,
    'sourceType', 'first_party_contract',
    'cnpjChecksumOnlyValidated', true,
    'formalRegistryStatus', 'unverified',
    'commercialQualificationStatus', 'unverified',
    'approval_status', 'NOT_APPROVED'
  )
from source_document s
where public.is_valid_cnpj_checksum(s.cnpj)
  and not exists (
    select 1 from public.discovered_company_candidates existing
     where upper(regexp_replace(coalesce(existing.cnpj,''), '[./[:space:]-]', '', 'g')) = s.cnpj
       and existing.candidate_status <> 'discarded'
  )
on conflict (dedupe_key) where dedupe_key is not null do nothing;
