-- Governed credit review gate between verified entity monitoring and decision surfaces.
-- Identity approval never implies credit eligibility. Only a versioned review with
-- field-level evidence can release qualification, scoring, ranking and pipeline.

create table if not exists public.company_credit_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  review_version integer not null,
  status text not null default 'draft',
  recommended_outcome text not null default 'pending',
  approved_outcome text,
  has_credit_product boolean,
  credit_is_core boolean,
  credit_product_type text,
  has_receivables boolean,
  receivables_structurable boolean,
  receivables_type text[] not null default '{}',
  receivables_recurrence_level text,
  receivables_predictability_level text,
  has_fidc boolean,
  uses_structured_debt boolean,
  funding_structure_type text,
  capital_structure_quality text,
  funding_gap_level text,
  fit_fidc boolean,
  fit_dcm boolean,
  timing_level text,
  suggested_structure text,
  structural_score numeric(6,2),
  capital_score numeric(6,2),
  receivables_score numeric(6,2),
  execution_score numeric(6,2),
  timing_score numeric(6,2),
  confidence numeric(5,4) not null default 0,
  rationale text,
  next_action text,
  evidence jsonb not null default '[]'::jsonb,
  review_payload jsonb not null default '{}'::jsonb,
  reviewer_user_id uuid,
  reviewer_email text,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_credit_reviews_version_unique unique(company_id,review_version),
  constraint company_credit_reviews_status_check check (status in ('draft','needs_evidence','approved','rejected')),
  constraint company_credit_reviews_recommended_outcome_check check (recommended_outcome in ('pending','eligible','monitor_only','ineligible')),
  constraint company_credit_reviews_approved_outcome_check check (approved_outcome is null or approved_outcome in ('eligible','monitor_only','ineligible')),
  constraint company_credit_reviews_confidence_check check (confidence between 0 and 1),
  constraint company_credit_reviews_score_check check (
    (structural_score is null or structural_score between 0 and 100)
    and (capital_score is null or capital_score between 0 and 100)
    and (receivables_score is null or receivables_score between 0 and 100)
    and (execution_score is null or execution_score between 0 and 100)
    and (timing_score is null or timing_score between 0 and 100)
  )
);

alter table public.company_credit_reviews enable row level security;
drop policy if exists company_credit_reviews_no_client_access on public.company_credit_reviews;
create policy company_credit_reviews_no_client_access
  on public.company_credit_reviews for all to anon,authenticated
  using (false) with check (false);
revoke all on table public.company_credit_reviews from public,anon,authenticated;
grant all on table public.company_credit_reviews to service_role;

create index if not exists idx_company_credit_reviews_company_latest
  on public.company_credit_reviews(company_id,review_version desc);
create index if not exists idx_company_credit_reviews_status
  on public.company_credit_reviews(status,updated_at desc);

create or replace function public.credit_review_blockers(p_company_id uuid,p_payload jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select coalesce(p_payload,'{}'::jsonb) as payload
  ), evidence as (
    select case when jsonb_typeof(payload->'evidence')='array'
      then payload->'evidence' else '[]'::jsonb end as items from input
  ), dimensions as (
    select coalesce(jsonb_agg(distinct item->>'dimension') filter (
      where nullif(btrim(item->>'dimension'),'') is not null
        and nullif(btrim(item->>'url'),'') is not null
    ),'[]'::jsonb) as covered
    from evidence, lateral jsonb_array_elements(items) item
  )
  select coalesce(jsonb_agg(blocker order by blocker),'[]'::jsonb)
  from (
    select 'company_entity_not_eligible'::text blocker
      where not public.is_company_entity_eligible(p_company_id)
    union all select 'credit_product_review_missing' from input
      where not (payload ? 'hasCreditProduct') or not (payload ? 'creditIsCore')
    union all select 'credit_product_type_missing' from input
      where coalesce((payload->>'hasCreditProduct')::boolean,false)
        and nullif(btrim(payload->>'creditProductType'),'') is null
    union all select 'receivables_review_missing' from input
      where not (payload ? 'hasReceivables') or not (payload ? 'receivablesStructurable')
    union all select 'receivables_type_missing' from input
      where coalesce((payload->>'hasReceivables')::boolean,false)
        and jsonb_array_length(case when jsonb_typeof(payload->'receivablesType')='array'
          then payload->'receivablesType' else '[]'::jsonb end)=0
    union all select 'funding_review_missing' from input
      where not (payload ? 'hasFidc') or not (payload ? 'usesStructuredDebt')
        or nullif(btrim(payload->>'fundingStructureType'),'') is null
        or nullif(btrim(payload->>'capitalStructureQuality'),'') is null
        or nullif(btrim(payload->>'fundingGapLevel'),'') is null
    union all select 'structure_fit_review_missing' from input
      where not (payload ? 'fitFidc') or not (payload ? 'fitDcm')
        or nullif(btrim(payload->>'suggestedStructure'),'') is null
    union all select 'timing_review_missing' from input
      where nullif(btrim(payload->>'timingLevel'),'') is null or not (payload ? 'timingScore')
    union all select 'scorecard_incomplete' from input
      where not (payload ? 'structuralScore') or not (payload ? 'capitalScore')
        or not (payload ? 'receivablesScore') or not (payload ? 'executionScore')
        or not (payload ? 'timingScore')
    union all select 'rationale_too_short' from input
      where length(btrim(coalesce(payload->>'rationale','')))<80
    union all select 'next_action_too_short' from input
      where length(btrim(coalesce(payload->>'nextAction','')))<20
    union all select 'review_confidence_below_threshold' from input
      where coalesce(nullif(payload->>'confidence','')::numeric,0)<0.75
    union all select 'recommended_outcome_missing' from input
      where coalesce(payload->>'recommendedOutcome','pending') not in ('eligible','monitor_only','ineligible')
    union all select 'minimum_evidence_not_met' from evidence where jsonb_array_length(items)<4
    union all select 'credit_product_evidence_missing' from dimensions where not (covered ? 'credit_product')
    union all select 'receivables_evidence_missing' from dimensions where not (covered ? 'receivables')
    union all select 'funding_evidence_missing' from dimensions where not (covered ? 'funding')
    union all select 'timing_evidence_missing' from dimensions where not (covered ? 'timing')
  ) b;
$$;

create or replace function public.save_company_credit_review_draft(
  p_company_id uuid,p_payload jsonb,p_reviewer_user_id uuid default null,
  p_reviewer_email text default null,p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_version integer;
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_blockers jsonb;
begin
  if not public.is_company_entity_eligible(p_company_id) then
    raise exception using errcode='23514',message='company is not entity eligible';
  end if;

  select coalesce(max(review_version),0)+1 into v_version
  from public.company_credit_reviews where company_id=p_company_id;

  insert into public.company_credit_reviews(
    company_id,review_version,status,recommended_outcome,
    has_credit_product,credit_is_core,credit_product_type,
    has_receivables,receivables_structurable,receivables_type,
    receivables_recurrence_level,receivables_predictability_level,
    has_fidc,uses_structured_debt,funding_structure_type,
    capital_structure_quality,funding_gap_level,fit_fidc,fit_dcm,
    timing_level,suggested_structure,structural_score,capital_score,
    receivables_score,execution_score,timing_score,confidence,rationale,
    next_action,evidence,review_payload,reviewer_user_id,reviewer_email,
    review_notes,created_at,updated_at
  ) values (
    p_company_id,v_version,'draft',coalesce(v_payload->>'recommendedOutcome','pending'),
    case when v_payload ? 'hasCreditProduct' then (v_payload->>'hasCreditProduct')::boolean end,
    case when v_payload ? 'creditIsCore' then (v_payload->>'creditIsCore')::boolean end,
    nullif(btrim(v_payload->>'creditProductType'),''),
    case when v_payload ? 'hasReceivables' then (v_payload->>'hasReceivables')::boolean end,
    case when v_payload ? 'receivablesStructurable' then (v_payload->>'receivablesStructurable')::boolean end,
    array(select jsonb_array_elements_text(case when jsonb_typeof(v_payload->'receivablesType')='array'
      then v_payload->'receivablesType' else '[]'::jsonb end)),
    nullif(btrim(v_payload->>'receivablesRecurrenceLevel'),''),
    nullif(btrim(v_payload->>'receivablesPredictabilityLevel'),''),
    case when v_payload ? 'hasFidc' then (v_payload->>'hasFidc')::boolean end,
    case when v_payload ? 'usesStructuredDebt' then (v_payload->>'usesStructuredDebt')::boolean end,
    nullif(btrim(v_payload->>'fundingStructureType'),''),
    nullif(btrim(v_payload->>'capitalStructureQuality'),''),
    nullif(btrim(v_payload->>'fundingGapLevel'),''),
    case when v_payload ? 'fitFidc' then (v_payload->>'fitFidc')::boolean end,
    case when v_payload ? 'fitDcm' then (v_payload->>'fitDcm')::boolean end,
    nullif(btrim(v_payload->>'timingLevel'),''),
    nullif(btrim(v_payload->>'suggestedStructure'),''),
    nullif(v_payload->>'structuralScore','')::numeric,
    nullif(v_payload->>'capitalScore','')::numeric,
    nullif(v_payload->>'receivablesScore','')::numeric,
    nullif(v_payload->>'executionScore','')::numeric,
    nullif(v_payload->>'timingScore','')::numeric,
    coalesce(nullif(v_payload->>'confidence','')::numeric,0),
    nullif(btrim(v_payload->>'rationale'),''),
    nullif(btrim(v_payload->>'nextAction'),''),
    case when jsonb_typeof(v_payload->'evidence')='array' then v_payload->'evidence' else '[]'::jsonb end,
    v_payload,p_reviewer_user_id,nullif(btrim(coalesce(p_reviewer_email,'')),''),
    nullif(btrim(coalesce(p_review_notes,'')),''),now(),now()
  ) returning id into v_id;

  v_blockers:=public.credit_review_blockers(p_company_id,v_payload);
  if jsonb_array_length(v_blockers)>0 then
    update public.company_credit_reviews set status='needs_evidence',updated_at=now() where id=v_id;
  end if;

  return jsonb_build_object(
    'reviewId',v_id,'companyId',p_company_id,'reviewVersion',v_version,
    'status',case when jsonb_array_length(v_blockers)>0 then 'needs_evidence' else 'draft' end,
    'blockers',v_blockers,'readyForDecision',jsonb_array_length(v_blockers)=0
  );
end;
$$;

create or replace function public.approve_company_credit_review(
  p_review_id uuid,p_approved_outcome text,p_reviewer_user_id uuid default null,
  p_reviewer_email text default null,p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.company_credit_reviews%rowtype;
  v_blockers jsonb;
  v_decision_eligible boolean;
  v_status text;
begin
  if p_approved_outcome not in ('eligible','monitor_only','ineligible') then
    raise exception using errcode='23514',message='invalid approved outcome';
  end if;

  select * into v_review from public.company_credit_reviews where id=p_review_id for update;
  if not found then raise exception using errcode='P0002',message='credit review not found'; end if;
  if v_review.status in ('approved','rejected') then
    raise exception using errcode='23514',message='credit review is already finalized';
  end if;
  perform 1 from public.companies where id=v_review.company_id for update;
  if not found then raise exception using errcode='P0002',message='company not found'; end if;

  v_blockers:=public.credit_review_blockers(v_review.company_id,v_review.review_payload);
  if jsonb_array_length(v_blockers)>0 then
    update public.company_credit_reviews
      set status='needs_evidence',updated_at=now(),
          review_notes=coalesce(nullif(btrim(coalesce(p_review_notes,'')),''),review_notes)
    where id=p_review_id;
    raise exception using errcode='23514',message='credit review evidence is incomplete',detail=v_blockers::text;
  end if;

  v_decision_eligible:=p_approved_outcome='eligible';
  v_status:=case when p_approved_outcome='ineligible' then 'rejected' else 'approved' end;

  update public.company_credit_reviews
  set status=v_status,approved_outcome=p_approved_outcome,
      reviewer_user_id=coalesce(p_reviewer_user_id,reviewer_user_id),
      reviewer_email=coalesce(nullif(btrim(coalesce(p_reviewer_email,'')),''),reviewer_email),
      review_notes=coalesce(nullif(btrim(coalesce(p_review_notes,'')),''),review_notes),
      reviewed_at=now(),updated_at=now()
  where id=p_review_id;

  update public.companies
  set credit_product=coalesce(v_review.has_credit_product,false),
      has_receivables=coalesce(v_review.has_receivables,false),
      has_fidc=coalesce(v_review.has_fidc,false),
      has_structured_debt=coalesce(v_review.uses_structured_debt,false),
      funding_gap=coalesce(v_review.funding_gap_level in ('medium','medium_high','high'),false),
      fit_fidc=coalesce(v_review.fit_fidc,false),
      fit_dcm=coalesce(v_review.fit_dcm,false),
      current_funding_structure=v_review.funding_structure_type,
      stage=case when v_decision_eligible then 'Qualified' else coalesce(stage,'Identified') end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'credit_review_id',p_review_id,'credit_review_version',v_review.review_version,
        'credit_review_status',v_status,'credit_reviewed_at',now(),
        'credit_reviewer_user_id',coalesce(p_reviewer_user_id,v_review.reviewer_user_id),
        'credit_reviewer_email',coalesce(nullif(btrim(coalesce(p_reviewer_email,'')),''),v_review.reviewer_email),
        'credit_classification_status',v_status,
        'qualification_status',case when v_decision_eligible then 'approved' else p_approved_outcome end,
        'decision_eligible',v_decision_eligible,
        'decision_eligibility_reason',case
          when v_decision_eligible then 'credit_review_approved'
          when p_approved_outcome='monitor_only' then 'credit_review_monitor_only'
          else 'credit_review_ineligible' end,
        'excluded_from_qualification',not v_decision_eligible,
        'excluded_from_scoring',not v_decision_eligible,
        'credit_product_type',v_review.credit_product_type,
        'credit_is_core',v_review.credit_is_core,
        'receivables_structurable',v_review.receivables_structurable,
        'receivables_type',to_jsonb(v_review.receivables_type),
        'receivables_recurrence_level',v_review.receivables_recurrence_level,
        'receivables_predictability_level',v_review.receivables_predictability_level,
        'capital_structure_quality',v_review.capital_structure_quality,
        'funding_gap_level',v_review.funding_gap_level,
        'timing_level',v_review.timing_level,
        'suggested_structure',v_review.suggested_structure,
        'credit_review_confidence',v_review.confidence,
        'credit_review_next_action',v_review.next_action
      ),updated_at=now()
  where id=v_review.company_id;

  update public.data_quality_violations
  set status='resolved',resolved_at=now()
  where entity_table='companies' and entity_id=v_review.company_id::text
    and rule_code='company_credit_classification_pending' and status='open';

  if not v_decision_eligible then
    insert into public.data_quality_violations(
      rule_code,entity_table,entity_id,severity,status,reason,observed_value
    ) select
      'company_not_decision_eligible_after_credit_review','companies',v_review.company_id::text,'low','open',
      case when p_approved_outcome='monitor_only'
        then 'Credit review approved the entity for monitoring only; decision surfaces remain closed.'
        else 'Credit review classified the company as ineligible for current origination decision surfaces.' end,
      jsonb_build_object('review_id',p_review_id,'approved_outcome',p_approved_outcome,'reviewed_at',now())
    where not exists (
      select 1 from public.data_quality_violations q
      where q.rule_code='company_not_decision_eligible_after_credit_review'
        and q.entity_table='companies' and q.entity_id=v_review.company_id::text and q.status='open'
    );
  else
    update public.data_quality_violations set status='resolved',resolved_at=now()
    where entity_table='companies' and entity_id=v_review.company_id::text
      and rule_code='company_not_decision_eligible_after_credit_review' and status='open';
  end if;

  return jsonb_build_object(
    'reviewId',p_review_id,'companyId',v_review.company_id,'status',v_status,
    'approvedOutcome',p_approved_outcome,'decisionEligible',v_decision_eligible,
    'decisionEligibilityReason',case
      when v_decision_eligible then 'credit_review_approved'
      when p_approved_outcome='monitor_only' then 'credit_review_monitor_only'
      else 'credit_review_ineligible' end,
    'reviewedAt',now()
  );
end;
$$;

create or replace view public.company_credit_review_queue_v1
with (security_invoker=true)
as
select
  c.id company_id,c.legal_name,c.trade_name,c.cnpj,c.domain,c.website,
  c.credit_product,c.has_receivables,c.has_fidc,c.has_structured_debt,
  c.funding_gap,c.fit_fidc,c.fit_dcm,c.current_funding_structure,c.metadata,
  latest.id latest_review_id,latest.review_version,latest.status review_status,
  latest.recommended_outcome,latest.approved_outcome,latest.confidence,
  latest.rationale,latest.next_action,latest.updated_at review_updated_at,
  (select count(*) from public.monitoring_outputs m where m.company_id=c.id) monitoring_output_count,
  (select count(*) from public.company_signals s where s.company_id=c.id) signal_count,
  (select count(*) from public.enrichments e where e.company_id=c.id) enrichment_count
from public.companies c
left join lateral (
  select r.* from public.company_credit_reviews r
  where r.company_id=c.id order by r.review_version desc limit 1
) latest on true
where public.is_company_entity_eligible(c.id)
  and not coalesce((c.metadata->>'synthetic_seed')::boolean,false);

create or replace function public.get_company_credit_review_queue(p_limit integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'companies',coalesce(jsonb_agg(to_jsonb(q) order by
      case coalesce(q.review_status,'not_started') when 'needs_evidence' then 0 when 'not_started' then 1 when 'draft' then 2 else 3 end,
      q.signal_count desc,q.trade_name),'[]'::jsonb),
    'summary',jsonb_build_object(
      'total',count(*),'notStarted',count(*) filter(where q.latest_review_id is null),
      'needsEvidence',count(*) filter(where q.review_status='needs_evidence'),
      'draft',count(*) filter(where q.review_status='draft'),
      'approved',count(*) filter(where q.review_status='approved'),
      'rejected',count(*) filter(where q.review_status='rejected'),
      'decisionEligible',count(*) filter(where coalesce((q.metadata->>'decision_eligible')::boolean,false))
    ),'generatedAt',now()
  )
  from (select * from public.company_credit_review_queue_v1
    limit greatest(1,least(coalesce(p_limit,100),500))) q;
$$;

create or replace function public.get_company_credit_review_packet(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'company',to_jsonb(c),
    'latestReview',(select to_jsonb(r) from public.company_credit_reviews r
      where r.company_id=c.id order by r.review_version desc limit 1),
    'evidenceCandidates',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.confidence desc,s.strength desc)
      from (
        select cs.id,cs.signal_type,cs.signal_label,
          coalesce(cs.signal_strength,cs.strength) strength,
          coalesce(cs.confidence_score,cs.confidence) confidence,
          cs.observed_vs_inferred,cs.is_explicit,cs.evidence_url,cs.evidence_text,
          cs.observed_at,sc.name source_name
        from public.company_signals cs left join public.source_catalog sc on sc.id=cs.source_id
        where cs.company_id=c.id and nullif(btrim(coalesce(cs.evidence_url,'')),'') is not null
        order by coalesce(cs.confidence_score,cs.confidence,0) desc,
          coalesce(cs.signal_strength,cs.strength,0) desc limit 40
      ) s
    ),'[]'::jsonb),
    'counts',jsonb_build_object(
      'monitoringOutputs',(select count(*) from public.monitoring_outputs m where m.company_id=c.id),
      'signals',(select count(*) from public.company_signals s where s.company_id=c.id),
      'enrichments',(select count(*) from public.enrichments e where e.company_id=c.id),
      'qualifications',(select count(*) from public.qualification_snapshots q where q.company_id=c.id),
      'scores',(select count(*) from public.score_snapshots s where s.company_id=c.id)
    ),'generatedAt',now()
  )
  from public.companies c
  where c.id=p_company_id and public.is_company_entity_eligible(c.id);
$$;

revoke all on public.company_credit_review_queue_v1 from public,anon,authenticated;
grant select on public.company_credit_review_queue_v1 to service_role;
revoke all on function public.credit_review_blockers(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.save_company_credit_review_draft(uuid,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.approve_company_credit_review(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_company_credit_review_queue(integer) from public,anon,authenticated;
revoke all on function public.get_company_credit_review_packet(uuid) from public,anon,authenticated;
grant execute on function public.credit_review_blockers(uuid,jsonb) to service_role;
grant execute on function public.save_company_credit_review_draft(uuid,jsonb,uuid,text,text) to service_role;
grant execute on function public.approve_company_credit_review(uuid,text,uuid,text,text) to service_role;
grant execute on function public.get_company_credit_review_queue(integer) to service_role;
grant execute on function public.get_company_credit_review_packet(uuid) to service_role;

notify pgrst,'reload schema';
