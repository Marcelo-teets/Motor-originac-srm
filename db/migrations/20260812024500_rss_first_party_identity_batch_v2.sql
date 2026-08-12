-- Second first-party identity batch for high-value RSS funding candidates.
--
-- Principles:
-- - Asaas has a single exact first-party legal identity tied to its receivables
--   anticipation contract and can be prefilled with full CNPJ.
-- - SumUp, CloudWalk and Stone expose multiple operating/financial entities in
--   their own legal pages. Their funding-event borrower/cedent is not proven by
--   the headline alone, so the group ambiguity is persisted instead of guessing.
-- - All rows remain pending human identity review. No Company Master promotion,
--   qualification or decision eligibility is changed.

begin;

-- ASAAS — exact first-party legal identity.
update public.discovered_company_candidates d
set legal_name = 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.',
    cnpj = '19540550000121',
    website = 'https://www.asaas.com/',
    normalized_domain = 'asaas.com',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis',
      'review_legal_name', 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.',
      'review_cnpj', '19540550000121',
      'review_website', 'https://www.asaas.com/',
      'review_confidence', 0.99,
      'review_evidence_summary', 'Documento first-party do Asaas para antecipação de recebíveis identifica ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A., CNPJ 19.540.550/0001-21. A evidência é usada apenas para preparar a revisão humana de identidade; promoção, qualification e decisão permanecem bloqueadas.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 2,
        'status', 'verified',
        'method', 'first_party_receivables_assignment_contract',
        'legalName', 'ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.',
        'cnpj', '19540550000121',
        'website', 'https://www.asaas.com/',
        'domain', 'asaas.com',
        'sourceUrl', 'https://central.ajuda.asaas.com/hc/pt-br/articles/32098812661275-Termo-Aditivo-Antecipa%C3%A7%C3%A3o-de-Receb%C3%ADveis',
        'confidence', 0.99,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'asaas'
  and d.candidate_status = 'captured'
  and regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g') !~ '^\d{14}$';

-- SUMUP — brand spans at least payments + SCD entities in first-party terms.
update public.discovered_company_candidates d
set website = 'https://sumup.com/pt-br/',
    normalized_domain = 'sumup.com',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://www.sumup.com/pt-br/termos-de-uso/facilita/',
      'review_website', 'https://sumup.com/pt-br/',
      'review_confidence', 0.78,
      'review_evidence_summary', 'Termos first-party da SumUp identificam múltiplas entidades brasileiras relacionadas à marca, incluindo SumUp Pagamentos Ltda. e SumUp Sociedade de Crédito Direto S.A. A matéria de funding não prova qual delas é a entidade econômica do FIDC; o CNPJ deve ser escolhido por revisão humana.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 2,
        'status', 'ambiguous_group',
        'method', 'first_party_multi_entity_group',
        'website', 'https://sumup.com/pt-br/',
        'domain', 'sumup.com',
        'confidence', 0.78,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false,
        'candidateEntities', jsonb_build_array(
          jsonb_build_object(
            'legalName', 'SUMUP PAGAMENTOS LTDA.',
            'cnpj', '16668076000120',
            'sourceUrl', 'https://www.sumup.com/pt-br/termos-de-uso/facilita/',
            'relationship', 'payments_entity_referenced_by_first_party_terms'
          ),
          jsonb_build_object(
            'legalName', 'SUMUP SOCIEDADE DE CRÉDITO DIRETO S.A.',
            'cnpj', '37241230000152',
            'sourceUrl', 'https://www.sumup.com/pt-br/termos-de-uso/pix-parcelado/',
            'relationship', 'credit_entity_referenced_by_first_party_terms'
          )
        )
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'sumup'
  and d.candidate_status = 'captured'
  and regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g') !~ '^\d{14}$';

-- CLOUDWALK — InfinitePay first-party terms identify payment + finance entities.
update public.discovered_company_candidates d
set website = 'https://www.infinitepay.io/',
    normalized_domain = 'infinitepay.io',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://www.infinitepay.io/termos',
      'review_website', 'https://www.infinitepay.io/',
      'review_confidence', 0.80,
      'review_evidence_summary', 'Termos first-party do ecossistema CloudWalk/InfinitePay identificam CloudWalk Instituição de Pagamento e Serviços Ltda. e CloudWalk Financeira S.A. Crédito, Financiamento e Investimento. Como o funding observado está ligado ao ecossistema InfinitePay e a matéria não prova a entidade jurídica do cedente/originador, o CNPJ permanece pendente de revisão humana.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 2,
        'status', 'ambiguous_group',
        'method', 'first_party_multi_entity_group',
        'website', 'https://www.infinitepay.io/',
        'domain', 'infinitepay.io',
        'confidence', 0.80,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false,
        'candidateEntities', jsonb_build_array(
          jsonb_build_object(
            'legalName', 'CLOUDWALK INSTITUIÇÃO DE PAGAMENTOS E SERVIÇOS LTDA.',
            'cnpj', '18189547000142',
            'sourceUrl', 'https://www.infinitepay.io/termos',
            'relationship', 'payments_and_infinitepay_operating_entity'
          ),
          jsonb_build_object(
            'legalName', 'CLOUDWALK FINANCEIRA S.A. CRÉDITO, FINANCIAMENTO E INVESTIMENTO',
            'cnpj', '05503849000100',
            'sourceUrl', 'https://www.infinitepay.io/termos',
            'relationship', 'credit_financing_entity_referenced_by_first_party_terms'
          )
        )
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'cloudwalk'
  and d.candidate_status = 'captured'
  and regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g') !~ '^\d{14}$';

-- STONE — first-party legal pages expose multiple payments/credit entities.
update public.discovered_company_candidates d
set website = 'https://www.stone.com.br/',
    normalized_domain = 'stone.com.br',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://docs.stone.com.br/docs/informa%C3%A7%C3%B5es-legais',
      'review_website', 'https://www.stone.com.br/',
      'review_confidence', 0.76,
      'review_evidence_summary', 'Documentos first-party da Stone identificam múltiplas entidades de pagamentos e crédito sob a marca. O headline de empréstimo de R$ 2 bilhões não determina qual entidade brasileira é a tomadora econômica; portanto nenhum CNPJ é escolhido automaticamente e a resolução permanece humana.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 2,
        'status', 'ambiguous_group',
        'method', 'first_party_multi_entity_group_external_funding',
        'website', 'https://www.stone.com.br/',
        'domain', 'stone.com.br',
        'confidence', 0.76,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false,
        'candidateEntities', jsonb_build_array(
          jsonb_build_object(
            'legalName', 'STONE INSTITUIÇÃO DE PAGAMENTO S.A.',
            'cnpj', '16501555000157',
            'sourceUrl', 'https://ajuda.stone.com.br/termos-e-condicoes-acao-stone-nextron',
            'relationship', 'payments_entity_referenced_by_first_party_terms'
          ),
          jsonb_build_object(
            'legalName', 'STONE SOCIEDADE DE CRÉDITO DIRETO S.A.',
            'cnpj', '34590184000109',
            'sourceUrl', 'https://docs.stone.com.br/docs/informa%C3%A7%C3%B5es-legais',
            'relationship', 'credit_entity_referenced_by_first_party_legal_docs'
          ),
          jsonb_build_object(
            'legalName', 'STONE SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A.',
            'cnpj', '53505601000112',
            'sourceUrl', 'https://ajuda.stone.com.br/informacoes/imposto-de-renda',
            'relationship', 'finance_and_investment_entity_referenced_by_first_party_docs'
          )
        )
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'stone'
  and d.candidate_status = 'captured'
  and regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g') !~ '^\d{14}$';

commit;
