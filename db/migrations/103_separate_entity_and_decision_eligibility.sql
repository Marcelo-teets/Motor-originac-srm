-- Entity verification and decision eligibility are separate gates.
-- A legally reconciled company may be monitored and enriched before it is
-- allowed into qualification, score, ranking or pipeline decision surfaces.

create or replace function public.is_company_entity_eligible(p_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select
      coalesce(c.metadata->>'data_status','partial')='real'
      and coalesce(c.metadata->>'identity_review_status','pending')='approved'
      and not coalesce((c.metadata->>'synthetic_seed')::boolean,false)
      and not coalesce((c.metadata->>'excluded_from_entity_resolution')::boolean,false)
    from public.companies c
    where c.id=p_company_id
  ),false);
$$;

-- Preserve the already validated transactional identity implementation behind
-- a wrapper that closes the downstream decision gate after entity creation.
do $$
begin
  if to_regprocedure('public.approve_candidate_identity_review_identity_v1(uuid,text,text,text,text,text,numeric,uuid,text,text)') is null then
    alter function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text)
      rename to approve_candidate_identity_review_identity_v1;
  end if;
end;
$$;

create or replace function public.approve_candidate_identity_review(
  p_candidate_id uuid,
  p_legal_name text,
  p_cnpj text,
  p_website text,
  p_identity_source_url text,
  p_evidence_summary text,
  p_confidence numeric default 0.8000,
  p_reviewer_user_id uuid default null,
  p_reviewer_email text default null,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_company_id uuid;
  v_now timestamptz:=now();
begin
  v_result:=public.approve_candidate_identity_review_identity_v1(
    p_candidate_id,p_legal_name,p_cnpj,p_website,p_identity_source_url,
    p_evidence_summary,p_confidence,p_reviewer_user_id,p_reviewer_email,p_review_notes
  );
  v_company_id:=nullif(v_result->>'companyId','')::uuid;
  if v_company_id is null then raise exception 'identity approval did not return companyId'; end if;

  update public.companies
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'data_status','real',
        'identity_verified',true,
        'entity_resolution_eligible',true,
        'monitoring_eligible',true,
        'decision_eligible',false,
        'decision_eligibility_reason','identity_only_pending_credit_review',
        'excluded_from_entity_resolution',false,
        'excluded_from_monitoring',false,
        'excluded_from_qualification',true,
        'excluded_from_scoring',true,
        'qualification_status','pending_evidence',
        'credit_classification_status','not_reviewed'
      ),
      updated_at=v_now
  where id=v_company_id;

  insert into public.data_quality_violations(
    rule_code,entity_table,entity_id,severity,status,reason,observed_value
  )
  select
    'company_credit_classification_pending','companies',v_company_id::text,'medium','open',
    'Entity identity is approved, but credit, receivables, funding and structure fit are not yet reviewed.',
    jsonb_build_object(
      'company_id',v_company_id,
      'identity_review_status','approved',
      'qualification_status','pending_evidence',
      'credit_classification_status','not_reviewed'
    )
  where not exists (
    select 1 from public.data_quality_violations q
    where q.rule_code='company_credit_classification_pending'
      and q.entity_table='companies'
      and q.entity_id=v_company_id::text
      and q.status='open'
  );

  return v_result||jsonb_build_object(
    'entityEligible',public.is_company_entity_eligible(v_company_id),
    'decisionEligible',false,
    'decisionEligibilityReason','identity_only_pending_credit_review',
    'classificationStatus','pending_separate_credit_review'
  );
end;
$$;

create or replace function public.candidate_promotion_blockers(
  p_cnpj text,
  p_website text,
  p_domain text,
  p_evidence_summary text,
  p_confidence numeric,
  p_raw_payload jsonb,
  p_company_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select public.candidate_identity_blockers(
    p_cnpj,p_website,p_domain,p_evidence_summary,p_confidence,p_raw_payload
  )||case
    when p_company_id is null or not public.is_company_entity_eligible(p_company_id)
      then jsonb_build_array('eligible_company_link_missing')
    else '[]'::jsonb
  end;
$$;

create or replace function public.enforce_candidate_identity_quality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_blockers jsonb;
begin
  new.raw_payload:=coalesce(new.raw_payload,'{}'::jsonb);
  if new.company_id is not null and not public.is_company_entity_eligible(new.company_id) then
    if new.candidate_status='promoted' then
      raise exception using errcode='23514',message='candidate cannot be promoted to an entity-ineligible company';
    end if;
    new.company_id:=null;
    new.candidate_status:='captured';
    new.raw_payload:=new.raw_payload||jsonb_build_object(
      'invalid_company_link_released',true,
      'identity_review_status','pending'
    );
  end if;
  if new.candidate_status='deduped' and new.company_id is null then new.candidate_status:='captured'; end if;
  v_blockers:=public.candidate_promotion_blockers(
    new.cnpj,new.website,new.normalized_domain,new.evidence_summary,new.confidence,new.raw_payload,new.company_id
  );
  new.raw_payload:=new.raw_payload||jsonb_build_object(
    'promotion_blockers',v_blockers,
    'promotion_ready',jsonb_array_length(v_blockers)=0,
    'identity_quality_gate_version',3
  );
  if new.candidate_status='promoted' and jsonb_array_length(v_blockers)>0 then
    raise exception using errcode='23514',message='candidate identity promotion prerequisites are incomplete',detail=v_blockers::text;
  end if;
  return new;
end;
$$;

create or replace function public.candidate_promotion_readiness(p_candidate_id uuid)
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  select jsonb_build_object(
    'candidateId',d.id,
    'companyName',d.company_name,
    'status',d.candidate_status,
    'ready',jsonb_array_length(public.candidate_promotion_blockers(
      d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id
    ))=0,
    'blockers',public.candidate_promotion_blockers(
      d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id
    ),
    'linkedCompanyId',d.company_id,
    'linkedCompanyEntityEligible',case when d.company_id is null then false else public.is_company_entity_eligible(d.company_id) end,
    'linkedCompanyDecisionEligible',case when d.company_id is null then false else public.is_company_decision_eligible(d.company_id) end,
    'confidence',d.confidence,
    'generatedAt',now()
  )
  from public.discovered_company_candidates d where d.id=p_candidate_id;
$$;

-- Correct entities approved before this semantic split.
update public.companies c
set metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
      'identity_verified',true,
      'entity_resolution_eligible',true,
      'monitoring_eligible',true,
      'decision_eligible',false,
      'decision_eligibility_reason','identity_only_pending_credit_review',
      'excluded_from_entity_resolution',false,
      'excluded_from_monitoring',false,
      'excluded_from_qualification',true,
      'excluded_from_scoring',true,
      'qualification_status','pending_evidence',
      'credit_classification_status','not_reviewed'
    ),
    updated_at=now()
where c.metadata->>'identity_review_status'='approved'
  and coalesce(c.metadata->>'credit_classification_status','not_reviewed')='not_reviewed';

insert into public.data_quality_violations(
  rule_code,entity_table,entity_id,severity,status,reason,observed_value
)
select
  'company_credit_classification_pending','companies',c.id::text,'medium','open',
  'Entity identity is approved, but credit, receivables, funding and structure fit are not yet reviewed.',
  jsonb_build_object(
    'company_id',c.id,
    'identity_review_status','approved',
    'qualification_status','pending_evidence',
    'credit_classification_status','not_reviewed'
  )
from public.companies c
where c.metadata->>'identity_review_status'='approved'
  and coalesce(c.metadata->>'credit_classification_status','not_reviewed')='not_reviewed'
  and not exists (
    select 1 from public.data_quality_violations q
    where q.rule_code='company_credit_classification_pending'
      and q.entity_table='companies'
      and q.entity_id=c.id::text
      and q.status='open'
  );

update public.discovered_company_candidates d
set raw_payload=coalesce(d.raw_payload,'{}'::jsonb)||jsonb_build_object(
      'promotion_blockers',public.candidate_promotion_blockers(
        d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id
      ),
      'promotion_ready',jsonb_array_length(public.candidate_promotion_blockers(
        d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id
      ))=0,
      'identity_quality_gate_version',3
    ),
    updated_at=now()
where d.candidate_status<>'discarded';

revoke all on function public.is_company_entity_eligible(uuid) from public,anon,authenticated;
revoke all on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text) from public,anon,authenticated;
revoke all on function public.approve_candidate_identity_review_identity_v1(uuid,text,text,text,text,text,numeric,uuid,text,text) from public,anon,authenticated;
revoke all on function public.candidate_promotion_blockers(text,text,text,text,numeric,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.candidate_promotion_readiness(uuid) from public,anon,authenticated;
revoke all on function public.enforce_candidate_identity_quality() from public,anon,authenticated;
grant execute on function public.is_company_entity_eligible(uuid) to service_role;
grant execute on function public.approve_candidate_identity_review(uuid,text,text,text,text,text,numeric,uuid,text,text) to service_role;
grant execute on function public.approve_candidate_identity_review_identity_v1(uuid,text,text,text,text,text,numeric,uuid,text,text) to service_role;
grant execute on function public.candidate_promotion_blockers(text,text,text,text,numeric,jsonb,uuid) to service_role;
grant execute on function public.candidate_promotion_readiness(uuid) to service_role;

notify pgrst,'reload schema';
