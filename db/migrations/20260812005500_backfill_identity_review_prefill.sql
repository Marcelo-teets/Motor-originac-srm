-- Prepare the already verified first-party website identities for the existing
-- human review screen without approving, promoting or decision-enabling them.
--
-- The website capture added review_* prefill fields for future candidates. This
-- bounded backfill gives the same UX to identities verified before that change.

begin;

update public.discovered_company_candidates d
set raw_payload = coalesce(d.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'review_legal_name', coalesce(
        nullif(d.raw_payload ->> 'review_legal_name', ''),
        nullif(btrim(d.legal_name), ''),
        nullif(btrim(d.company_name), '')
      ),
      'review_cnpj', coalesce(
        nullif(d.raw_payload ->> 'review_cnpj', ''),
        regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g')
      ),
      'review_website', coalesce(
        nullif(d.raw_payload ->> 'review_website', ''),
        nullif(btrim(d.website), '')
      ),
      'review_confidence', coalesce(
        nullif(d.raw_payload ->> 'review_confidence', '')::numeric,
        nullif(d.raw_payload -> 'website_identity_capture' ->> 'confidence', '')::numeric,
        d.confidence,
        0.70
      ),
      'review_evidence_summary', coalesce(
        nullif(d.raw_payload ->> 'review_evidence_summary', ''),
        concat(
          'O cadastro oficial da CVM confirma ',
          coalesce(nullif(btrim(d.legal_name), ''), nullif(btrim(d.company_name), ''), 'a entidade'),
          ' (CNPJ ', regexp_replace(coalesce(d.cnpj, ''), '\D', '', 'g'), '). ',
          'O website ', coalesce(nullif(btrim(d.website), ''), d.raw_payload ->> 'identity_evidence_url'),
          ' foi verificado pela captura first-party com método ',
          coalesce(d.raw_payload -> 'website_identity_capture' ->> 'matchType', 'identidade corporativa'),
          ' e confiança ',
          round(coalesce(nullif(d.raw_payload -> 'website_identity_capture' ->> 'confidence', '')::numeric, d.confidence, 0.70) * 100),
          '%. Esta evidência prepara apenas a revisão humana de identidade; produto de crédito, recebíveis, funding e fit estrutural permanecem sem inferência automática.'
        )
      )
    ),
    updated_at = now()
where d.candidate_status = 'captured'
  and coalesce(d.raw_payload ->> 'identity_review_status', 'pending') = 'pending'
  and d.raw_payload -> 'website_identity_capture' ->> 'status' = 'verified'
  and nullif(btrim(coalesce(d.website, '')), '') is not null
  and nullif(btrim(coalesce(d.normalized_domain, '')), '') is not null;

commit;
