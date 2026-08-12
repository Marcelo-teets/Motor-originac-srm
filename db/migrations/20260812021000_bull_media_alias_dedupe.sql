-- Remove one known legacy media alias from the commercial queue without losing
-- its source evidence. Fresh discovery already normalizes `Fintech <brand>` to
-- the canonical brand, so this is a bounded repair for the pre-v11 stock only.
--
-- Canonical: Bull
-- Alias:     Fintech Bull
-- Both rows describe the same R$ 10m funding event / consignado expansion in
-- separate media sources captured in the same discovery cycle.

begin;

with canonical as (
  select id, company_name, source_url, evidence_summary
  from public.discovered_company_candidates
  where lower(btrim(company_name)) = 'bull'
    and candidate_status = 'captured'
    and raw_payload -> 'commercial_semantics' ->> 'signalClass' = 'direct_funding_trigger'
  order by captured_at asc, created_at asc
  limit 1
)
update public.discovered_company_candidates alias
set candidate_status = 'discarded',
    raw_payload = coalesce(alias.raw_payload, '{}'::jsonb) || jsonb_build_object(
      'candidate_role', 'duplicate_alias',
      'commercial_queue', false,
      'classification_status', 'discarded_duplicate_alias',
      'classification_reason', 'descriptor_alias_same_brand',
      'discarded_reason', 'duplicate_media_alias_of_canonical_candidate',
      'discarded_at', now(),
      'duplicate_alias', jsonb_build_object(
        'version', 1,
        'canonicalCandidateId', canonical.id,
        'canonicalCompanyName', canonical.company_name,
        'aliasCompanyName', alias.company_name,
        'canonicalEvidence', canonical.evidence_summary,
        'aliasEvidence', alias.evidence_summary,
        'canonicalSourceUrl', canonical.source_url,
        'aliasSourceUrl', alias.source_url,
        'resolvedAt', now(),
        'automaticPromotion', false,
        'automaticDecisionEligibility', false
      )
    ),
    updated_at = now()
from canonical
where lower(btrim(alias.company_name)) = 'fintech bull'
  and alias.candidate_status = 'captured'
  and alias.raw_payload -> 'commercial_semantics' ->> 'signalClass' = 'direct_funding_trigger';

commit;
