-- MVP Closure Gate 3: Company Master identity is the gate to automated origination analytics.
-- This DOES NOT approve credit. It only allows a real, verified operating company to receive
-- qualification, patterns, scores, thesis, ranking and commercial next-action artifacts.

update public.companies c
set metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
      'decision_eligible',true,
      'decision_eligibility_reason','verified_entity_ready_for_origination_qualification',
      'origination_analytics_eligible',true,
      'credit_approval_separate',true
    ),
    updated_at=now()
where public.is_company_entity_eligible(c.id)
  and coalesce(c.metadata->>'credit_review_status','')<>'rejected'
  and coalesce(c.metadata->>'qualification_status','')<>'ineligible';

-- Any future deterministic identity resolution immediately enters origination analytics.
create or replace function public.promote_verified_entity_to_origination_analytics()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(new.metadata->>'data_status','partial')='real'
     and coalesce((new.metadata->>'identity_verified')::boolean,false)
     and coalesce((new.metadata->>'entity_resolution_eligible')::boolean,false)
     and not coalesce((new.metadata->>'synthetic_seed')::boolean,false)
     and coalesce(new.metadata->>'credit_review_status','')<>'rejected'
     and coalesce(new.metadata->>'qualification_status','')<>'ineligible' then
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'decision_eligible',true,
      'decision_eligibility_reason','verified_entity_ready_for_origination_qualification',
      'origination_analytics_eligible',true,
      'credit_approval_separate',true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promote_verified_entity_to_origination_analytics on public.companies;
create trigger trg_promote_verified_entity_to_origination_analytics
before insert or update of metadata on public.companies
for each row execute function public.promote_verified_entity_to_origination_analytics();

-- Requeue all now-eligible real companies so downstream artifacts are refreshed.
insert into public.origination_reprocessing_queue(company_id,status,reasons,first_queued_at,queued_at,updated_at)
select c.id,'queued',jsonb_build_array('origination_entity_eligibility_gate'),now(),now(),now()
from public.companies c
where public.is_company_decision_eligible(c.id)
on conflict (company_id) do update set status='queued',queued_at=now(),updated_at=now();
