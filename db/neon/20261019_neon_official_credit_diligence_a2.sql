-- V5 A2 — evidence-only discovery from verified primary corporate terms (observed 2026-10-19).
-- Capture only: NEVER assign credit eligibility, funding gap, score or commercial approval.
-- Existing search_profiles and discovered_company_candidates remain the canonical modules.
-- Four previously absent operating entities; Creditas is reconciled in place below.
WITH evidence (
  cnpj, company_name, legal_name, website, normalized_domain, subsegment,
  credit_product, source_url, economic_role, counterparties, next_action
) AS (
 VALUES
  ('16581207000137', 'DM', 'DM Instituição de Pagamento S.A.', 'https://www.vocedm.com.br/', 'vocedm.com.br', 'Cartões / pagamentos', 'Cartões e pagamentos; entidade efetivamente credora por produto depende de reconciliação', 'https://www.vocedm.com.br/portal/wp-content/uploads/2025/12/DM.-Contrato-Cartao-de-Credito.pdf', 'Instituição de pagamento / plataforma do grupo DM, não atribuir automaticamente carteira da financeira', '["DM Cartões PL S.A. 52135675000141","DM Financeira S.A. 91669747000192","DM SCD 37555231000171"]'::jsonb, 'Conciliar cedente CVM DM IP com empresa credora, cessões, balanço e emissão; mapear carteira por CNPJ.'),
  ('19540550000121', 'Asaas', 'Asaas Gestão Financeira Instituição de Pagamento S.A.', 'https://www.asaas.com/', 'asaas.com', 'Recebíveis / pagamentos', 'Antecipação de recebíveis por contrato de cessão', 'https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis', 'Intermediação/aquisição de direitos creditórios por Asaas, FIDC Asaas ou parceiros, conforme caso', '["FIDC Asaas 29828802000176","Asaas SCFI S.A. (CNPJ pendente de reconciliação)"]'::jsonb, 'Mapear cessão e originador economicamente exposto por operação; volume, lastro, fluxo e capacidade de funding.'),
  ('27852506000185', 'meutudo', 'TUDO Serviços S.A.', 'https://meutudo.com.br/', 'meutudo.com.br', 'Crédito consignado / correspondente', 'Distribuição digital de crédito consignado', 'https://meutudo.com.br/parati/', 'Correspondente de crédito; titularidade dos contratos da Parati não presumida', '["Parati CFI S.A. 03311443000191"]'::jsonb, 'Verificar quem concede as CCBs, risco residual TUDO, possíveis cessões e necessidade de funding próprio.'),
  ('11275560000175', 'RecargaPay', 'RecargaPay Instituição de Pagamento Ltda.', 'https://recargapay.com.br/', 'recargapay.com.br', 'Pagamentos / distribuição de crédito', 'Empréstimo pessoal ofertado na plataforma como correspondente', 'https://recargapay.com.br/terms/emprestimo', 'Correspondente; credora originadora do produto é RP Financeira, não a instituição de pagamento', '["RP Financeira S.A. SCFI 44431743000191"]'::jsonb, 'Entender saldo de CCBs e estrutura de cessão na RP Financeira; mapear exposição e necessidade de funding por entidade.')
), checked AS (
 SELECT e.*
 FROM evidence e
 WHERE public.is_valid_cnpj_checksum(e.cnpj)
)
INSERT INTO public.discovered_company_candidates (
  search_profile_id, company_name, legal_name, website, normalized_domain,
  cnpj, cnpj_valid, geography, segment, subsegment, company_type,
  candidate_role, credit_product, source_ref, source_url, evidence_summary,
  receivables, confidence, candidate_status, dedupe_key, raw_payload, metadata
)
SELECT
  'sp_fintech_credit_receivables', company_name, legal_name, website, normalized_domain,
  cnpj, true, 'Brasil', 'Fintech', subsegment, 'Entidade operacional — revisar papel econômico',
  'operating_company', credit_product, 'official-corporate-terms:' || cnpj, source_url,
  'Fonte jurídica primária confirma identidade e produto/oferta. ' ||
  'Não comprova que a entidade retenha carteira, precise de funding ou seja elegível ao ICP.',
  '[]'::jsonb, 0.70, 'captured', 'official-terms:20261019:' || cnpj,
  jsonb_build_object(
    'origin','official_corporate_terms_observation',
    'candidate_role','operating_company',
    'commercial_queue',false,
    'captured_at_date','2026-10-19',
    'source_url', source_url, 'legal_name_observed',legal_name,
    'economic_role_observed',economic_role,'counterparties_to_reconcile',counterparties,
    'next_action',next_action,'human_identity_review_required',true,
    'receivables_ownership','unknown', 'funding_gap','unknown',
    'credit_core_for_specific_legal_entity','unverified', 'commercial_eligibility','unverified',
    'unknown_fields',jsonb_build_array('receivables balance','origination monthly volume','risk ownership',
      'funding stack','investment grade / financial health','headcount','ticket','timing')
  ),
  jsonb_build_object('research_phase','A2_diligence_pending',
    'evidence_type','first_party_legal_document',
    'official_source_url',source_url,'verified_scope','legal_name_cnpj_product_or_distribution',
    'approval_status','NOT_APPROVED','human_reviewer',null)
FROM checked
WHERE NOT EXISTS (
  SELECT 1 FROM public.discovered_company_candidates existing
  WHERE existing.cnpj=checked.cnpj
    AND existing.candidate_role='operating_company'
    AND existing.candidate_status IN ('captured','deduped','promoted')
)
ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

-- Creditas already exists twice as VC-discovered candidates.
-- Keep the original VC provenance and status, enrich *only* source-backed
-- identity and factual lender role without inserting a third duplicate.
UPDATE public.discovered_company_candidates
SET cnpj_valid = public.is_valid_cnpj_checksum('32997490000139'),
    legal_name = 'Creditas Sociedade de Crédito Direto S.A.',
    raw_payload = raw_payload || jsonb_build_object(
      'candidate_role','operating_company',
      'commercial_queue',false,
      'official_corporate_terms',
      jsonb_build_object(
        'observed_at','2026-10-19',
        'source_url','https://www.creditas.com/legal/termos-condicoes',
        'government_issuer_source','https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/credito-do-trabalhador/instituicoes-financeiras-habilitadas/instituicoes-habilitadas',
        'cnpj','32997490000139',
        'legal_name','Creditas Sociedade de Crédito Direto S.A.',
        'role','Sociedade de Crédito Direto citada como instituição parceira',
        'funding_gap','unknown',
        'ownership_of_each_CCB','unverified',
        'human_identity_review_required',true)
    ),
    metadata = metadata || jsonb_build_object(
      'research_phase','A2_diligence_pending',
      'evidence_type','first_party_legal_document_and_government_list',
      'approval_status','NOT_APPROVED'
    ),
    updated_at=now()
WHERE company_name='Creditas'
  AND cnpj='32997490000139'
  AND candidate_role='operating_company'
  AND candidate_status='captured'
  AND source_url='https://www.kaszek.com/companies'
  AND (legal_name IS DISTINCT FROM 'Creditas Sociedade de Crédito Direto S.A.'
       OR raw_payload->'official_corporate_terms' IS NULL);
