-- Credit review decisions must be reversible without leaving stale eligibility
-- in the Company Master. Legacy finalized reviews without an attributable
-- reviewer are quarantined as needs_evidence; their analytical content remains.

create or replace function public.sync_company_credit_review_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A historical review must never overwrite a newer decision for the company.
  if exists (
    select 1
    from public.company_credit_reviews newer
    where newer.company_id = new.company_id
      and newer.review_version > new.review_version
  ) then
    return new;
  end if;

  if new.status not in ('approved', 'rejected') then
    update public.companies
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'credit_review_id', new.id,
      'credit_review_version', new.review_version,
      'credit_review_status', new.status,
      'credit_review_outcome', null,
      'credit_reviewed_at', null,
      'credit_reviewer_user_id', null,
      'credit_reviewer_email', null,
      'credit_classification_status', new.status,
      'qualification_status', 'pending',
      'decision_eligible', false,
      'decision_eligibility_reason', case
        when new.status = 'needs_evidence' then 'credit_review_needs_evidence'
        else 'credit_review_draft'
      end,
      'excluded_from_qualification', true,
      'excluded_from_scoring', true
    ),
    updated_at = now()
    where id = new.company_id;

    return new;
  end if;

  update public.companies
  set
    credit_product = coalesce(new.has_credit_product, false),
    has_receivables = coalesce(new.has_receivables, false),
    has_fidc = coalesce(new.has_fidc, false),
    has_structured_debt = coalesce(new.uses_structured_debt, false),
    funding_gap = coalesce(new.funding_gap_level in ('medium', 'medium_high', 'high'), false),
    fit_fidc = coalesce(new.fit_fidc, false),
    fit_dcm = coalesce(new.fit_dcm, false),
    current_funding_structure = new.funding_structure_type,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'credit_review_id', new.id,
      'credit_review_version', new.review_version,
      'credit_review_status', new.status,
      'credit_review_outcome', new.approved_outcome,
      'credit_reviewed_at', new.reviewed_at,
      'credit_reviewer_user_id', new.reviewer_user_id,
      'credit_reviewer_email', new.reviewer_email,
      'credit_classification_status', new.status,
      'qualification_status', coalesce(new.approved_outcome, 'pending'),
      'decision_eligible', new.status = 'approved' and new.approved_outcome = 'eligible',
      'decision_eligibility_reason', case
        when new.status = 'approved' and new.approved_outcome = 'eligible' then 'credit_review_approved'
        when new.status = 'approved' and new.approved_outcome = 'monitor_only' then 'credit_review_monitor_only'
        else 'credit_review_ineligible'
      end,
      'excluded_from_qualification', not (new.status = 'approved' and new.approved_outcome = 'eligible'),
      'excluded_from_scoring', not (new.status = 'approved' and new.approved_outcome = 'eligible'),
      'credit_product_type', new.credit_product_type,
      'credit_is_core', new.credit_is_core,
      'credit_review_has_receivables', new.has_receivables,
      'receivables_structurable', new.receivables_structurable,
      'receivables_type', to_jsonb(new.receivables_type),
      'receivables_recurrence_level', new.receivables_recurrence_level,
      'receivables_predictability_level', new.receivables_predictability_level,
      'credit_review_has_fidc', new.has_fidc,
      'credit_review_uses_structured_debt', new.uses_structured_debt,
      'credit_review_funding_structure_type', new.funding_structure_type,
      'capital_structure_quality', new.capital_structure_quality,
      'funding_gap_level', new.funding_gap_level,
      'credit_review_fit_fidc', new.fit_fidc,
      'credit_review_fit_dcm', new.fit_dcm,
      'timing_level', new.timing_level,
      'suggested_structure', new.suggested_structure,
      'credit_review_structural_score', new.structural_score,
      'credit_review_capital_score', new.capital_score,
      'credit_review_receivables_score', new.receivables_score,
      'credit_review_execution_score', new.execution_score,
      'credit_review_timing_score', new.timing_score,
      'credit_review_confidence', new.confidence,
      'credit_review_rationale', new.rationale,
      'credit_review_next_action', new.next_action,
      'credit_review_evidence', new.evidence
    ),
    updated_at = now()
  where id = new.company_id;

  update public.data_quality_violations
  set status = 'resolved', resolved_at = now()
  where rule_code = 'credit_review_missing_authenticated_reviewer'
    and entity_table = 'company_credit_reviews'
    and entity_id = new.id::text
    and status = 'open';

  return new;
end;
$$;

revoke execute on function public.sync_company_credit_review_metadata() from public;
revoke execute on function public.sync_company_credit_review_metadata() from anon, authenticated;
grant execute on function public.sync_company_credit_review_metadata() to service_role;

update public.company_credit_reviews
set
  status = 'needs_evidence',
  approved_outcome = null,
  reviewer_email = null,
  reviewed_at = null,
  updated_at = now()
where status in ('approved', 'rejected')
  and reviewer_user_id is null;

update public.data_quality_violations violation
set observed_value = coalesce(violation.observed_value, '{}'::jsonb) || jsonb_build_object(
  'quarantined_at', now(),
  'quarantined_status', 'needs_evidence'
)
where violation.rule_code = 'credit_review_missing_authenticated_reviewer'
  and violation.entity_table = 'company_credit_reviews'
  and violation.status = 'open';

notify pgrst, 'reload schema';
