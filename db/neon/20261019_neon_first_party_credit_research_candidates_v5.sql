-- V5 A2 discovery: 4 first-party DOCUMENTED legal entities for human due diligence.
-- This is evidence ingestion, NOT a loan-tape assertion, commercial qualification,
-- human identity approval, FIDC recommendation or Company Master promotion.
-- Source contracts verified 2026-10-19; no nonpublic data or extrapolated balances.
-- Creditas already has 2 captured candidates and is intentionally not duplicated.
--
-- Every candidate remains in the IDENTITY queue (commercial_queue=false).
-- The CNPJ checksum is a formatting sanity check, NOT live RFB registration status.

with source_documents (
  company_name, legal_name, cnpj, website, normalized_domain, subsegment,
  company_type, credit_product, evidence_url, evidence_summary,
  economic_role, open_question
) as (
  values
  (
    'Asaas',
    'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S/A',
    '19540550000121',
    'https://www.asaas.com/',
    'asaas.com',
    'Antecipação de recebíveis',
    'Instituição de Pagamento',
    'Oferta contratual de antecipação de recebíveis; cessionário e funding a validar',
    'https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis',
    'Termo próprio do Asaas identifica o CNPJ da instituição de pagamento e documenta serviço de antecipação por cessão de crédito; não prova que o Asaas retenha o ativo, nem volume ou funding gap.',
    'payment_institution_with_receivables_product',
    'Identificar cessionário, originador econômico, direitos efetivamente detidos, escala e funding atual'
  ),
  (
    'DM Financeira',
    'DM SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A.',
    '91669747000192',
    'https://www.vocedm.com.br/',
    'vocedm.com.br',
    'Crédito pessoal',
    'Financeira',
    'Contrato de empréstimo pessoal como credora potencial; carteira e funding não evidenciados',
    'https://www.vocedm.com.br/portal/contratos/contrato-de-emprestimo-pessoal/',
    'Contrato oficial identifica a DM SCFI CNPJ 91.669.747/0001-92 como possível concedente do empréstimo; não equivale à DM Instituição de Pagamento CNPJ 16.581.207/0001-37 presente no cadastro FIDC.',
    'regulated_lending_entity',
    'Conciliar por produto a financeira, a emissora do cartão e a IP; verificar CCBs, fundos, titularidade e capital'
  ),
  (
    'meutudo',
    'TUDO SERVIÇOS S.A.',
    '27852506000185',
    'https://meutudo.com.br/',
    'meutudo.com.br',
    'Distribuição digital de consignado',
    'Correspondente bancário',
    'Distribuição de crédito consignado por correspondente; carteira própria não demonstrada',
    'https://meutudo.com.br/parati/',
    'Página oficial identifica a TUDO Serviços S.A. como fintech correspondente da PARATI CFI CNPJ 03.311.443/0001-91; não atribuir à TUDO as CCBs ou o risco formal da credora.',
    'credit_correspondent_without_confirmed_owned_portfolio',
    'Verificar se TUDO detém direitos econômicos, origina ou coorigina recebíveis e requer capital em balanço'
  ),
  (
    'RecargaPay / RP Financeira',
    'RP FINANCEIRA S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO',
    '44431743000191',
    null,
    null,
    'Empréstimo pessoal',
    'Financeira do conglomerado RecargaPay',
    'Contrato identifica RP Financeira como credora originadora; cessão de CCB é possibilidade contratual',
    'https://recargapay.com.br/terms/emprestimo',
    'Regulamento oficial identifica RP Financeira CNPJ 44.431.743/0001-91 como credora originadora, distinta da RecargaPay IP CNPJ 11.275.560/0001-75, correspondente. Não prova carteira disponível ou necessidade de novo FIDC.',
    'lending_originator_distinct_from_payment_distributor',
    'Mapear carteiras originadas e cedidas, FIDC existente, estrutura de depósitos e gap de capital comprovável'
  )
)
insert into public.discovered_company_candidates (
  search_profile_id, company_name, legal_name, cnpj, cnpj_valid,
  website, normalized_domain, geography, segment, subsegment,
  company_type, candidate_role, credit_product, target_structure,
  source_ref, source_url, evidence_summary, receivables, confidence,
  candidate_status, dedupe_key, raw_payload, metadata
)
select
  'sp_fintech_credit_receivables', s.company_name, s.legal_name, s.cnpj, null,
  s.website, s.normalized_domain, 'Brasil', 'Fintech / Serviços Financeiros', s.subsegment,
  s.company_type, 'operating_company', s.credit_product, null,
  'first-party-contract:' || s.cnpj,
  s.evidence_url, s.evidence_summary, '[]'::jsonb, 0.70,
  'captured', 'first-party:cnpj:' || s.cnpj,
  jsonb_build_object(
    'origin', 'official_company_contract',
    'candidate_role', 'operating_company',
    'commercial_queue', false,
    'identity_review_status', 'pending',
    'humanApprovalRequired', true,
    'companyMasterPromotionAuthorized', false,
    'evidenceType', 'first_party_contract',
    'evidenceObservedOn', '2026-10-19',
    'legalCnpjSource', s.evidence_url,
    'economicRoleObserved', s.economic_role,
    'creditProductObserved', true,
    'receivablesStructurability', 'unknown',
    'portfolioOwnership', 'unknown',
    'fundingGap', 'unknown',
    'ticketFit', 'unknown',
    'whyNow', 'unknown',
    'nextDiligence', s.open_question,
    'separateDistributorOriginator', true
  ),
  jsonb_build_object(
    'researchCohort', 'fidc_dcm_first_party_credit_v5',
    'researchDate', '2026-10-19',
    'sourceUrl', s.evidence_url,
    'sourceType', 'first_party_contract',
    'cnpjChecksumOnlyValidated', true,
    'formalRegistryStatus', 'unverified',
    'commercialQualificationStatus', 'unverified'
  )
from source_documents s
where public.is_valid_cnpj_checksum(s.cnpj)
  and not exists (
    select 1 from public.discovered_company_candidates existing
    where regexp_replace(coalesce(existing.cnpj,''), '\D', '', 'g') = s.cnpj
      and existing.candidate_status <> 'discarded'
  )
on conflict (dedupe_key) where dedupe_key is not null do nothing;
