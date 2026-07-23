-- Promotion requires both reviewed identity and an eligible Company Master link.

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
  ) || case
    when p_company_id is null or not public.is_company_decision_eligible(p_company_id)
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
  if new.company_id is not null and not public.is_company_decision_eligible(new.company_id) then
    if new.candidate_status='promoted' then raise exception using errcode='23514',message='candidate cannot be promoted to an ineligible company'; end if;
    new.company_id:=null; new.candidate_status:='captured';
    new.raw_payload:=new.raw_payload||jsonb_build_object('invalid_company_link_released',true,'identity_review_status','pending');
  end if;
  if new.candidate_status='deduped' and new.company_id is null then new.candidate_status:='captured'; end if;
  v_blockers:=public.candidate_promotion_blockers(new.cnpj,new.website,new.normalized_domain,new.evidence_summary,new.confidence,new.raw_payload,new.company_id);
  new.raw_payload:=new.raw_payload||jsonb_build_object('promotion_blockers',v_blockers,'promotion_ready',jsonb_array_length(v_blockers)=0,'identity_quality_gate_version',1);
  if new.candidate_status='promoted' and jsonb_array_length(v_blockers)>0 then
    raise exception using errcode='23514',message='candidate promotion prerequisites are incomplete',detail=v_blockers::text;
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
    'ready',jsonb_array_length(public.candidate_promotion_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id))=0,
    'blockers',public.candidate_promotion_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id),
    'linkedCompanyId',d.company_id,
    'linkedCompanyEligible',case when d.company_id is null then false else public.is_company_decision_eligible(d.company_id) end,
    'confidence',d.confidence,
    'generatedAt',now()
  )
  from public.discovered_company_candidates d where d.id=p_candidate_id;
$$;

update public.discovered_company_candidates d
set raw_payload=coalesce(d.raw_payload,'{}'::jsonb)||jsonb_build_object(
  'promotion_blockers',public.candidate_promotion_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id),
  'promotion_ready',jsonb_array_length(public.candidate_promotion_blockers(d.cnpj,d.website,d.normalized_domain,d.evidence_summary,d.confidence,d.raw_payload,d.company_id))=0
),updated_at=now()
where d.candidate_status<>'promoted';

revoke all on function public.candidate_promotion_blockers(text,text,text,text,numeric,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.candidate_promotion_blockers(text,text,text,text,numeric,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
