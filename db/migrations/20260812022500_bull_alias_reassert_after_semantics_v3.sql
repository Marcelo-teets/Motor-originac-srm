-- Re-assert the legacy `Fintech Bull` alias suppression after the RSS semantics
-- v3 rollout. A classifier run that had already selected the alias before the
-- previous migration committed later rewrote raw_payload while preserving the
-- discarded status. This repair is intentionally bounded to the exact alias and
-- is safe because the classifier only selects candidate_status='captured'.

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
      'discarded_at', coalesce(alias.raw_payload ->> 'discarded_at', now()::text),
      'duplicate_alias', jsonb_build_object(
        'version', 2,
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
  and alias.candidate_status = 'discarded';

commit;
