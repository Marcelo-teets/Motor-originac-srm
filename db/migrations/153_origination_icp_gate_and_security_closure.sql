-- P0/P1 closure: separate verified entities from commercial decision eligibility,
-- recover stale Search Profile runs and close exposed SECURITY DEFINER/RLS advisor findings.

-- A verified company may be monitored and enriched without being a ranked origination lead.
create or replace function public.is_company_origination_icp_eligible(p_company_id uuid)
returns boolean
language sql
security invoker
stable
set search_path=public
as $$
  select coalesce((
    select
      public.is_company_entity_eligible(c.id)
      and coalesce(c.metadata->>'credit_review_status','') <> 'rejected'
      and coalesce(c.metadata->>'qualification_status','') <> 'ineligible'
      and not coalesce((c.metadata->>'synthetic_seed')::boolean,false)
      and (
        coalesce(c.metadata->>'icp_status','') = 'eligible'
        or exists (
          select 1
          from public.company_discovery_links dl
          join public.discovered_company_candidates dc on dc.id=dl.discovered_candidate_id
          join public.search_profiles sp on sp.id=dc.search_profile_id
          where dl.company_id=c.id
            and sp.active
            and coalesce(sp.min_employee_count,0) >= 50
            and lower(coalesce(sp.geography,'')) in ('br','brasil','brazil')
            and coalesce(dc.confidence,0) >= 0.60
            and coalesce(dc.company_type,'') not ilike '%veículo%'
            and coalesce(dc.company_name,'') not ilike '%fundo de investimento%'
            and (
              lower(coalesce(dc.segment,'')) ~ '(fintech|embedded finance|marketplace|tech|receivables|recebíveis|crédito|credito)'
              or lower(coalesce(dc.credit_product,'')) ~ '(crédito|credito|receiv|antecip|financ|fidc)'
              or coalesce(c.credit_product,false)
              or coalesce(c.has_receivables,false)
              or coalesce(c.fit_fidc,false)
              or coalesce(c.fit_dcm,false)
            )
        )
      )
  from public.companies c
  where c.id=p_company_id
  ),false);
$$;

comment on function public.is_company_origination_icp_eligible(uuid) is
  'ICP gate: real verified entity plus explicit ICP approval or a production Search Profile requiring 50+ employees and credit/receivables/tech fit. QA/regulatory discovery alone never qualifies a lead.';

revoke all on function public.is_company_origination_icp_eligible(uuid) from public,anon,authenticated;
grant execute on function public.is_company_origination_icp_eligible(uuid) to service_role;

-- Canonical decision gate now means commercial origination eligibility, not identity verification.
create or replace function public.is_company_decision_eligible(p_company_id uuid)
returns boolean
language sql
security invoker
stable
set search_path=public
as $$
  select public.is_company_origination_icp_eligible(p_company_id);
$$;

revoke all on function public.is_company_decision_eligible(uuid) from public,anon,authenticated;
grant execute on function public.is_company_decision_eligible(uuid) to service_role;

-- Reconcile a company after identity or discovery-link changes.
create or replace function public.reconcile_company_origination_eligibility(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entity boolean;
  v_icp boolean;
begin
  if p_company_id is null then return; end if;
  v_entity:=public.is_company_entity_eligible(p_company_id);
  v_icp:=case when v_entity then public.is_company_origination_icp_eligible(p_company_id) else false end;

  update public.companies c
  set metadata=coalesce(c.metadata,'{}'::jsonb)||jsonb_build_object(
        'origination_analytics_eligible',v_entity,
        'decision_eligible',v_icp,
        'decision_eligibility_reason',case
          when not v_entity then 'entity_not_verified'
          when v_icp then 'origination_icp_gate_v2'
          else 'identity_verified_pending_icp'
        end,
        'icp_gate_version',2,
        'icp_headcount_requirement',50,
        'icp_gate_evaluated_at',now()
      ),
      updated_at=now()
  where c.id=p_company_id
    and (
      coalesce((c.metadata->>'origination_analytics_eligible')::boolean,false) is distinct from v_entity
      or coalesce((c.metadata->>'decision_eligible')::boolean,false) is distinct from v_icp
      or coalesce(c.metadata->>'icp_gate_version','') <> '2'
    );
end;
$$;

revoke all on function public.reconcile_company_origination_eligibility(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_company_origination_eligibility(uuid) to service_role;

-- Replace the broad v1 auto-promotion trigger. Identity verification enables analytics only;
-- commercial eligibility is reconciled after the candidate link exists.
create or replace function public.promote_verified_entity_to_origination_analytics()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_entity boolean;
begin
  v_entity:=
    coalesce(new.metadata->>'data_status','partial')='real'
    and coalesce((new.metadata->>'identity_verified')::boolean,false)
    and coalesce((new.metadata->>'entity_resolution_eligible')::boolean,false)
    and not coalesce((new.metadata->>'synthetic_seed')::boolean,false);

  if v_entity then
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'origination_analytics_eligible',true,
      'decision_eligible',case
        when coalesce(new.metadata->>'icp_status','')='eligible' then true
        else false
      end,
      'decision_eligibility_reason',case
        when coalesce(new.metadata->>'icp_status','')='eligible' then 'explicit_icp_approval'
        else 'identity_verified_pending_icp'
      end,
      'credit_approval_separate',true,
      'icp_gate_version',2,
      'icp_headcount_requirement',50
    );
  else
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'origination_analytics_eligible',false,
      'decision_eligible',false,
      'decision_eligibility_reason','entity_not_verified',
      'icp_gate_version',2,
      'icp_headcount_requirement',50
    );
  end if;
  return new;
end;
$$;

revoke all on function public.promote_verified_entity_to_origination_analytics() from public,anon,authenticated;
grant execute on function public.promote_verified_entity_to_origination_analytics() to service_role;

create or replace function public.trg_reconcile_company_origination_eligibility_from_link()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.reconcile_company_origination_eligibility(coalesce(new.company_id,old.company_id));
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.trg_reconcile_company_origination_eligibility_from_link() from public,anon,authenticated;
grant execute on function public.trg_reconcile_company_origination_eligibility_from_link() to service_role;

drop trigger if exists trg_reconcile_company_origination_eligibility_from_link on public.company_discovery_links;
create trigger trg_reconcile_company_origination_eligibility_from_link
after insert or update or delete on public.company_discovery_links
for each row execute function public.trg_reconcile_company_origination_eligibility_from_link();

-- Reconcile the live Company Master without deleting identity/evidence history.
do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.reconcile_company_origination_eligibility(r.id);
  end loop;
end;
$$;

-- Search Profile run watchdog: a run cannot remain running for weeks.
update public.search_profile_runs
set run_status='failed',
    finished_at=coalesce(finished_at,now()),
    notes=concat_ws(' ',nullif(notes,''),'Recovered by stale-run watchdog: run exceeded 2 hours.'),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'staleRunRecovered',true,'watchdogVersion','p0_closure_v1','recoveredAt',now()
    ),
    updated_at=now()
where run_status in ('queued','running')
  and started_at < now()-interval '2 hours';

-- SECURITY DEFINER functions flagged by the live advisor: service-only execution.
revoke execute on function public.is_company_origination_brief_eligible_v1(uuid) from public,anon,authenticated;
revoke execute on function public.promote_verified_entity_to_origination_analytics() from public,anon,authenticated;
revoke execute on function public.refresh_company_origination_brief_v1(uuid) from public,anon,authenticated;
revoke execute on function public.trg_refresh_company_origination_brief_from_company_v2() from public,anon,authenticated;
revoke execute on function public.trg_refresh_company_origination_brief_v1() from public,anon,authenticated;

grant execute on function public.is_company_origination_brief_eligible_v1(uuid) to service_role;
grant execute on function public.promote_verified_entity_to_origination_analytics() to service_role;
grant execute on function public.refresh_company_origination_brief_v1(uuid) to service_role;
grant execute on function public.trg_refresh_company_origination_brief_from_company_v2() to service_role;
grant execute on function public.trg_refresh_company_origination_brief_v1() to service_role;

-- Service-owned RLS tables intentionally deny browser roles; explicit policies remove ambiguity.
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_treatment_results','data_treatment_runs','microsoft_connections',
    'microsoft_sync_runs','microsoft_task_links','origination_reprocessing_queue'
  ] loop
    execute format('drop policy if exists service_owned_explicit_deny on public.%I',t);
    execute format(
      'create policy service_owned_explicit_deny on public.%I as restrictive for all to anon,authenticated using (false) with check (false)',t
    );
  end loop;
end;
$$;

notify pgrst,'reload schema';
