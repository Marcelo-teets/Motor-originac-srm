-- Keep the approved human credit review as the canonical base for qualification
-- and commercial execution. Monitoring and public signals may adjust confidence,
-- timing and risk, but must not overwrite the reviewed product, receivables,
-- funding thesis, suggested structure or next action.

create or replace function public.sync_company_credit_review_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('approved','rejected') then
    return new;
  end if;

  update public.companies
  set
    credit_product=coalesce(new.has_credit_product,false),
    has_receivables=coalesce(new.has_receivables,false),
    has_fidc=coalesce(new.has_fidc,false),
    has_structured_debt=coalesce(new.uses_structured_debt,false),
    funding_gap=coalesce(new.funding_gap_level in ('medium','medium_high','high'),false),
    fit_fidc=coalesce(new.fit_fidc,false),
    fit_dcm=coalesce(new.fit_dcm,false),
    current_funding_structure=new.funding_structure_type,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'credit_review_id',new.id,
      'credit_review_version',new.review_version,
      'credit_review_status',new.status,
      'credit_review_outcome',new.approved_outcome,
      'credit_reviewed_at',new.reviewed_at,
      'credit_reviewer_user_id',new.reviewer_user_id,
      'credit_reviewer_email',new.reviewer_email,
      'credit_classification_status',new.status,
      'qualification_status',coalesce(new.approved_outcome,'pending'),
      'decision_eligible',new.status='approved' and new.approved_outcome='eligible',
      'decision_eligibility_reason',case
        when new.status='approved' and new.approved_outcome='eligible' then 'credit_review_approved'
        when new.status='approved' and new.approved_outcome='monitor_only' then 'credit_review_monitor_only'
        else 'credit_review_ineligible'
      end,
      'excluded_from_qualification',not (new.status='approved' and new.approved_outcome='eligible'),
      'excluded_from_scoring',not (new.status='approved' and new.approved_outcome='eligible'),
      'credit_product_type',new.credit_product_type,
      'credit_is_core',new.credit_is_core,
      'credit_review_has_receivables',new.has_receivables,
      'receivables_structurable',new.receivables_structurable,
      'receivables_type',to_jsonb(new.receivables_type),
      'receivables_recurrence_level',new.receivables_recurrence_level,
      'receivables_predictability_level',new.receivables_predictability_level,
      'credit_review_has_fidc',new.has_fidc,
      'credit_review_uses_structured_debt',new.uses_structured_debt,
      'credit_review_funding_structure_type',new.funding_structure_type,
      'capital_structure_quality',new.capital_structure_quality,
      'funding_gap_level',new.funding_gap_level,
      'credit_review_fit_fidc',new.fit_fidc,
      'credit_review_fit_dcm',new.fit_dcm,
      'timing_level',new.timing_level,
      'suggested_structure',new.suggested_structure,
      'credit_review_structural_score',new.structural_score,
      'credit_review_capital_score',new.capital_score,
      'credit_review_receivables_score',new.receivables_score,
      'credit_review_execution_score',new.execution_score,
      'credit_review_timing_score',new.timing_score,
      'credit_review_confidence',new.confidence,
      'credit_review_rationale',new.rationale,
      'credit_review_next_action',new.next_action,
      'credit_review_evidence',new.evidence
    ),
    updated_at=now()
  where id=new.company_id;

  return new;
end;
$$;

drop trigger if exists sync_company_credit_review_metadata on public.company_credit_reviews;
create trigger sync_company_credit_review_metadata
after insert or update of status,approved_outcome,reviewed_at on public.company_credit_reviews
for each row execute function public.sync_company_credit_review_metadata();

with latest_review as (
  select distinct on (company_id) *
  from public.company_credit_reviews
  where status in ('approved','rejected')
  order by company_id,review_version desc,updated_at desc,id desc
)
update public.companies company
set
  credit_product=coalesce(review.has_credit_product,false),
  has_receivables=coalesce(review.has_receivables,false),
  has_fidc=coalesce(review.has_fidc,false),
  has_structured_debt=coalesce(review.uses_structured_debt,false),
  funding_gap=coalesce(review.funding_gap_level in ('medium','medium_high','high'),false),
  fit_fidc=coalesce(review.fit_fidc,false),
  fit_dcm=coalesce(review.fit_dcm,false),
  current_funding_structure=review.funding_structure_type,
  metadata=coalesce(company.metadata,'{}'::jsonb)||jsonb_build_object(
    'credit_review_id',review.id,
    'credit_review_version',review.review_version,
    'credit_review_status',review.status,
    'credit_review_outcome',review.approved_outcome,
    'credit_reviewed_at',review.reviewed_at,
    'credit_reviewer_user_id',review.reviewer_user_id,
    'credit_reviewer_email',review.reviewer_email,
    'credit_classification_status',review.status,
    'qualification_status',coalesce(review.approved_outcome,'pending'),
    'decision_eligible',review.status='approved' and review.approved_outcome='eligible',
    'decision_eligibility_reason',case
      when review.status='approved' and review.approved_outcome='eligible' then 'credit_review_approved'
      when review.status='approved' and review.approved_outcome='monitor_only' then 'credit_review_monitor_only'
      else 'credit_review_ineligible'
    end,
    'excluded_from_qualification',not (review.status='approved' and review.approved_outcome='eligible'),
    'excluded_from_scoring',not (review.status='approved' and review.approved_outcome='eligible'),
    'credit_product_type',review.credit_product_type,
    'credit_is_core',review.credit_is_core,
    'credit_review_has_receivables',review.has_receivables,
    'receivables_structurable',review.receivables_structurable,
    'receivables_type',to_jsonb(review.receivables_type),
    'receivables_recurrence_level',review.receivables_recurrence_level,
    'receivables_predictability_level',review.receivables_predictability_level,
    'credit_review_has_fidc',review.has_fidc,
    'credit_review_uses_structured_debt',review.uses_structured_debt,
    'credit_review_funding_structure_type',review.funding_structure_type,
    'capital_structure_quality',review.capital_structure_quality,
    'funding_gap_level',review.funding_gap_level,
    'credit_review_fit_fidc',review.fit_fidc,
    'credit_review_fit_dcm',review.fit_dcm,
    'timing_level',review.timing_level,
    'suggested_structure',review.suggested_structure,
    'credit_review_structural_score',review.structural_score,
    'credit_review_capital_score',review.capital_score,
    'credit_review_receivables_score',review.receivables_score,
    'credit_review_execution_score',review.execution_score,
    'credit_review_timing_score',review.timing_score,
    'credit_review_confidence',review.confidence,
    'credit_review_rationale',review.rationale,
    'credit_review_next_action',review.next_action,
    'credit_review_evidence',review.evidence
  ),
  updated_at=now()
from latest_review review
where company.id=review.company_id;

create or replace function public.sync_credit_review_pipeline_override()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_metadata jsonb;
  v_next_action text;
  v_structure text;
begin
  select metadata into v_metadata
  from public.companies
  where id=new.company_id
    and public.is_company_decision_eligible(id);

  if v_metadata is null or v_metadata->>'credit_review_status'<>'approved' then
    return null;
  end if;

  v_next_action:=nullif(btrim(v_metadata->>'credit_review_next_action'),'');
  v_structure:=nullif(btrim(v_metadata->>'suggested_structure'),'');

  update public.pipeline
  set
    stage=case when stage in ('Identified','Qualified') then 'Qualified' else stage end,
    status='active',
    priority=coalesce(new.bucket,new.priority_tier,priority,'watchlist'),
    next_action=coalesce(v_next_action,next_action),
    expected_structure=coalesce(v_structure,expected_structure),
    notes=concat_ws(' ',nullif(notes,''),format('[credit_review_v1 review=%s]',coalesce(v_metadata->>'credit_review_id','unknown'))),
    updated_at=now()
  where company_id=new.company_id;

  return null;
end;
$$;

drop trigger if exists zz_sync_credit_review_pipeline_override on public.lead_score_snapshots;
create trigger zz_sync_credit_review_pipeline_override
after insert on public.lead_score_snapshots
for each row execute function public.sync_credit_review_pipeline_override();

update public.pipeline pipeline
set
  stage=case when pipeline.stage in ('Identified','Qualified') then 'Qualified' else pipeline.stage end,
  status='active',
  next_action=coalesce(nullif(btrim(company.metadata->>'credit_review_next_action'),''),pipeline.next_action),
  expected_structure=coalesce(nullif(btrim(company.metadata->>'suggested_structure'),''),pipeline.expected_structure),
  notes=concat_ws(' ',nullif(pipeline.notes,''),format('[credit_review_v1 review=%s]',coalesce(company.metadata->>'credit_review_id','unknown'))),
  updated_at=now()
from public.companies company
where pipeline.company_id=company.id
  and public.is_company_decision_eligible(company.id)
  and company.metadata->>'credit_review_status'='approved';

comment on function public.sync_company_credit_review_metadata() is
  'Espelha a revisão de crédito aprovada no Company Master para que qualification e scoring usem fatos revisados como base canônica.';
comment on function public.sync_credit_review_pipeline_override() is
  'Garante que estrutura e próxima ação aprovadas na revisão humana prevaleçam sobre textos genéricos derivados de sinais públicos.';

notify pgrst,'reload schema';
