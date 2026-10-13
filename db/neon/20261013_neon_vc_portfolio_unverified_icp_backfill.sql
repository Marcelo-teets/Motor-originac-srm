-- Correct stale VC-portfolio search-profile hypotheses misrepresented as facts.
-- Exactly 14 historical captured operating_company candidates observed 13-Oct-2026.
-- Non-destructive; preserve original hypotheses and evidence in raw_payload.
-- Fail closed if live cohort unexpectedly drifted since approved audit.
do $$
declare
  v_count integer;
  v_updated integer;
begin
  select count(*) into v_count
  from public.discovered_company_candidates
  where source_ref like 'vc-portfolio:%'
    and candidate_status = 'captured'
    and candidate_role = 'operating_company'
    and company_id is null
    and segment = 'Fintech'
    and subsegment = 'Embedded Finance, Payments'
    and company_type = 'Middle Market'
    and credit_product = 'crédito recebíveis antecipação'
    and target_structure = 'FIDC'
    and geography = 'Brasil';

  if v_count <> 14 then
    raise exception 'vc_portfolio_historical_cohort_drift: expected 14, got %', v_count;
  end if;

  update public.discovered_company_candidates
     set raw_payload = coalesce(raw_payload, '{}'::jsonb)
       || jsonb_build_object(
         'profileAttributeVerification', 'unverified_portfolio_only',
         'historicalProfileHypothesis', jsonb_build_object(
           'segment', segment, 'subsegment', subsegment, 'companyType', company_type,
           'creditProduct', credit_product, 'targetStructure', target_structure,
           'geography', geography
         ),
         'identityAndCreditReviewRequired', true
       ),
       segment = 'Unverified',
       subsegment = 'Unverified',
       company_type = 'Unverified',
       credit_product = 'Unknown',
       target_structure = 'Unknown',
       geography = 'Unverified',
       updated_at = now()
  where source_ref like 'vc-portfolio:%'
    and candidate_status = 'captured'
    and candidate_role = 'operating_company'
    and company_id is null
    and segment = 'Fintech'
    and subsegment = 'Embedded Finance, Payments'
    and company_type = 'Middle Market'
    and credit_product = 'crédito recebíveis antecipação'
    and target_structure = 'FIDC'
    and geography = 'Brasil';

  get diagnostics v_updated = row_count;
  if v_updated <> 14 then
    raise exception 'vc_portfolio_historical_cohort_update_mismatch: expected 14, updated %', v_updated;
  end if;
end;
$$;
