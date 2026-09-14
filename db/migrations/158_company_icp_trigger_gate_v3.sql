-- Keep the companies BEFORE trigger aligned with the verified headcount ICP gate v3.
-- Migration 155 hardened the RPC/function gate; this migration removes the legacy v2 audit overwrite.

create or replace function public.promote_verified_entity_to_origination_analytics()
returns trigger
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_entity boolean;
  v_icp boolean:=false;
  v_headcount integer;
begin
  v_entity:=
    coalesce(new.metadata->>'data_status','partial')='real'
    and coalesce((new.metadata->>'identity_verified')::boolean,false)
    and coalesce((new.metadata->>'entity_resolution_eligible')::boolean,false)
    and not coalesce((new.metadata->>'synthetic_seed')::boolean,false);

  if v_entity then
    v_headcount:=case
      when tg_op='INSERT' then public.parse_headcount_floor(new.employee_count_range)
      else public.company_verified_headcount_floor(new.id)
    end;

    if tg_op<>'INSERT' then
      v_icp:=public.is_company_origination_icp_eligible(new.id);
    end if;

    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'origination_analytics_eligible',true,
      'decision_eligible',v_icp,
      'decision_eligibility_reason',case
        when v_icp then 'origination_icp_gate_v3'
        when coalesce(v_headcount,0)<50 then 'identity_verified_headcount_unverified_or_below_50'
        else 'identity_verified_pending_icp'
      end,
      'credit_approval_separate',true,
      'icp_gate_version',3,
      'icp_headcount_requirement',50,
      'icp_verified_headcount_floor',v_headcount,
      'icp_gate_evaluated_at',now()
    );
  else
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'origination_analytics_eligible',false,
      'decision_eligible',false,
      'decision_eligibility_reason','entity_not_verified',
      'icp_gate_version',3,
      'icp_headcount_requirement',50,
      'icp_verified_headcount_floor',null,
      'icp_gate_evaluated_at',now()
    );
  end if;
  return new;
end;
$$;

revoke all on function public.promote_verified_entity_to_origination_analytics() from public,anon,authenticated;
grant execute on function public.promote_verified_entity_to_origination_analytics() to service_role;

-- Reconcile after replacing the BEFORE trigger so persisted audit metadata also becomes v3.
do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.reconcile_company_origination_eligibility(r.id);
  end loop;
end;
$$;

notify pgrst,'reload schema';
