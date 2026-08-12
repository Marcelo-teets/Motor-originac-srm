-- Seed high-confidence first-party identity evidence for priority RSS funding
-- candidates. This migration prepares the existing human identity review only;
-- it does not approve identity, promote to Company Master or enable credit decisions.
--
-- Sources captured on 2026-08-12:
--   iugu:   https://www.iugu.com/juridico/politica-de-privacidade
--   CashGO: https://www.cashgo.com.br/termos-de-uso/
--   OpenCo: https://open-co.com/privacidade.html and https://www.rebel.com.br/
--
-- OpenCo is intentionally left without a chosen CNPJ because first-party pages
-- expose multiple legal entities connected to the brand/group. The ambiguity is
-- persisted for human resolution instead of guessing which entity owns the
-- observed funding event.

begin;

update public.discovered_company_candidates d
set legal_name = 'iugu Instituição de Pagamento S.A.',
    cnpj = '15111975000164',
    website = 'https://www.iugu.com/',
    normalized_domain = 'iugu.com',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://www.iugu.com/juridico/politica-de-privacidade',
      'review_legal_name', 'iugu Instituição de Pagamento S.A.',
      'review_cnpj', '15111975000164',
      'review_website', 'https://www.iugu.com/',
      'review_confidence', 0.99,
      'review_evidence_summary', 'Página jurídica oficial da iugu declara a entidade iugu Instituição de Pagamento S.A., CNPJ 15.111.975/0001-64, e o domínio iugu.com. A evidência prepara somente a revisão humana de identidade; nenhuma promoção, qualification ou decisão de crédito é liberada automaticamente.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 1,
        'status', 'verified',
        'method', 'first_party_exact_legal_name_cnpj',
        'legalName', 'iugu Instituição de Pagamento S.A.',
        'cnpj', '15111975000164',
        'website', 'https://www.iugu.com/',
        'domain', 'iugu.com',
        'sourceUrl', 'https://www.iugu.com/juridico/politica-de-privacidade',
        'confidence', 0.99,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'iugu'
  and d.source_ref = 'src_finsiders_rss'
  and d.candidate_status = 'captured'
  and nullif(regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g'), '') is null;

update public.discovered_company_candidates d
set legal_name = 'Antecipa Solucoes Financeiras e Tecnologia Ltda.',
    cnpj = '42544764000198',
    website = 'https://www.cashgo.com.br/',
    normalized_domain = 'cashgo.com.br',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://www.cashgo.com.br/termos-de-uso/',
      'review_legal_name', 'Antecipa Solucoes Financeiras e Tecnologia Ltda.',
      'review_cnpj', '42544764000198',
      'review_website', 'https://www.cashgo.com.br/',
      'review_confidence', 0.99,
      'review_evidence_summary', 'Termos de Uso oficiais da CashGO declaram que a plataforma pertence à Antecipa Solucoes Financeiras e Tecnologia Ltda., CNPJ 42.544.764/0001-98. A evidência prepara somente a revisão humana de identidade; nenhuma promoção, qualification ou decisão de crédito é liberada automaticamente.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 1,
        'status', 'verified',
        'method', 'first_party_exact_legal_name_cnpj',
        'legalName', 'Antecipa Solucoes Financeiras e Tecnologia Ltda.',
        'cnpj', '42544764000198',
        'website', 'https://www.cashgo.com.br/',
        'domain', 'cashgo.com.br',
        'sourceUrl', 'https://www.cashgo.com.br/termos-de-uso/',
        'confidence', 0.99,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'cashgo'
  and d.source_ref = 'src_finsiders_rss'
  and d.candidate_status = 'captured'
  and nullif(regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g'), '') is null;

update public.discovered_company_candidates d
set website = 'https://open-co.com/',
    normalized_domain = 'open-co.com',
    raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'identity_review_status', coalesce(nullif(d.raw_payload ->> 'identity_review_status', ''), 'pending'),
      'legal_name_verified', false,
      'promotion_ready', false,
      'identity_evidence_url', 'https://open-co.com/privacidade.html',
      'review_website', 'https://open-co.com/',
      'review_confidence', 0.75,
      'review_evidence_summary', 'A marca OpenCo possui evidência first-party de múltiplas entidades jurídicas relacionadas. A política atual do domínio open-co.com identifica Geru Tecnologia Ltda. como operadora comercial da marca, enquanto páginas first-party do ecossistema Rebel/Open Co também referenciam Open Co Tecnologia e Open Co Sociedade de Crédito Direto. O CNPJ do candidato deve ser escolhido por revisão humana conforme a entidade econômica vinculada ao funding observado.',
      'first_party_identity_capture', jsonb_build_object(
        'version', 1,
        'status', 'ambiguous_group',
        'method', 'first_party_multi_entity_conflict',
        'website', 'https://open-co.com/',
        'domain', 'open-co.com',
        'confidence', 0.75,
        'observedAt', now(),
        'humanApprovalRequired', true,
        'automaticPromotion', false,
        'automaticDecisionEligibility', false,
        'candidateEntities', jsonb_build_array(
          jsonb_build_object(
            'legalName', 'Geru Tecnologia Ltda.',
            'cnpj', '24077504000178',
            'sourceUrl', 'https://open-co.com/privacidade.html',
            'relationship', 'current_site_controller_and_brand_operator'
          ),
          jsonb_build_object(
            'legalName', 'Open Co Tecnologia Ltda.',
            'cnpj', '20955843000159',
            'sourceUrl', 'https://www.rebel.com.br/',
            'relationship', 'group_operating_entity_referenced_by_first_party_site'
          ),
          jsonb_build_object(
            'legalName', 'Open Co Sociedade de Crédito Direto S.A.',
            'cnpj', '37763847000138',
            'sourceUrl', 'https://www.rebel.com.br/',
            'relationship', 'group_credit_institution_referenced_by_first_party_site'
          )
        )
      )
    ),
    updated_at = now()
where lower(btrim(d.company_name)) = 'open co'
  and d.source_ref = 'src_finsiders_rss'
  and d.candidate_status = 'captured'
  and nullif(regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g'), '') is null;

commit;
