-- P1 closure hardening: a Search Profile requirement is not company evidence.
-- A company can only become decision-eligible when its own persisted headcount evidence
-- satisfies the relevant production Search Profile cutoff (minimum 50 employees).

create or replace function public.parse_headcount_floor(p_value text)
returns integer
language plpgsql
immutable
set search_path=''
as $$
declare
  v_match text[];
  v_digits text;
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then return null; end if;
  v_match:=regexp_match(p_value,'([0-9][0-9\.,]*)');
  if v_match is null then return null; end if;
  v_digits:=regexp_replace(v_match[1],'[^0-9]','','g');
  if v_digits='' then return null; end if;
  return least(1000000,v_digits::integer);
exception when others then
  return null;
end;
$$;

create or replace function public.company_verified_headcount_floor(p_company_id uuid)
returns integer
language sql
security invoker
stable
set search_path=''
as $$
  with company_values as (
    select greatest(
      coalesce(public.parse_headcount_floor(to_jsonb(c)->>'employee_count_range'),0),
      coalesce(public.parse_headcount_floor(c.metadata->>'icp_headcount_verified_min'),0),
      coalesce(public.parse_headcount_floor(c.metadata->>'employee_count'),0)
    )::integer as value
    from public.companies c where c.id=p_company_id
  ), metric_values as (
    select coalesce(max(m.metric_value),0)::integer as value
    from public.company_source_metric_snapshots m
    where m.company_id=p_company_id
      and lower(m.metric_key) in ('employee_count','employees','headcount','linkedin_employee_count','company_employee_count')
      and m.metric_value is not null
      and m.metric_value>=0
      and m.observed_vs_inferred='observed'
      and m.observed_at>=now()-interval '365 days'
      and (case when m.confidence_score>1 then m.confidence_score/100.0 else m.confidence_score end)>=0.60
  ), linked_candidate_values as (
    select coalesce(max(
      nullif(regexp_replace(coalesce(dc.raw_payload#>>'{firmographic_evidence,headcountMin}',''),'[^0-9]','','g'),'')::integer
    ),0)::integer as value
    from public.company_discovery_links dl
    join public.discovered_company_candidates dc on dc.id=dl.discovered_candidate_id
    where dl.company_id=p_company_id
      and nullif(dc.raw_payload#>>'{firmographic_evidence,provider}','') is not null
      and nullif(dc.raw_payload#>>'{firmographic_evidence,observedAt}','') is not null
      and (dc.raw_payload#>>'{firmographic_evidence,observedAt}')::timestamptz>=now()-interval '365 days'
  )
  select nullif(greatest(
    coalesce((select value from company_values),0),
    coalesce((select value from metric_values),0),
    coalesce((select value from linked_candidate_values),0)
  ),0);
$$;

comment on function public.company_verified_headcount_floor(uuid) is
  'Returns the highest defensible company-level headcount lower bound from persisted company metadata, observed metric snapshots or linked firmographic evidence; stale/inferred metrics are excluded.';

revoke all on function public.parse_headcount_floor(text) from public,anon,authenticated;
revoke all on function public.company_verified_headcount_floor(uuid) from public,anon,authenticated;
grant execute on function public.parse_headcount_floor(text) to service_role;
grant execute on function public.company_verified_headcount_floor(uuid) to service_role;

create or replace function public.is_company_origination_icp_eligible(p_company_id uuid)
returns boolean
language sql
security invoker
stable
set search_path=''
as $$
  select coalesce((
    select
      public.is_company_entity_eligible(c.id)
      and coalesce(c.metadata->>'credit_review_status','')<>'rejected'
      and coalesce(c.metadata->>'qualification_status','')<>'ineligible'
      and not coalesce((c.metadata->>'synthetic_seed')::boolean,false)
      and (
        coalesce((c.metadata->>'icp_headcount_override')::boolean,false)
        or coalesce(public.company_verified_headcount_floor(c.id),0)>=50
      )
      and (
        (
          coalesce(c.metadata->>'icp_status','')='eligible'
          and (
            coalesce((c.metadata->>'icp_headcount_override')::boolean,false)
            or coalesce(public.company_verified_headcount_floor(c.id),0)>=50
          )
        )
        or exists (
          select 1
          from public.company_discovery_links dl
          join public.discovered_company_candidates dc on dc.id=dl.discovered_candidate_id
          join public.search_profiles sp on sp.id=dc.search_profile_id
          where dl.company_id=c.id
            and sp.active
            and not coalesce(sp.config ? 'qaSmoke',false)
            and coalesce(sp.min_employee_count,0)>=50
            and lower(coalesce(sp.geography,'')) in ('br','brasil','brazil')
            and coalesce(dc.confidence,0)>=0.60
            and coalesce(dc.company_type,'') not ilike '%veículo%'
            and coalesce(dc.company_name,'') not ilike '%fundo de investimento%'
            and (
              coalesce((c.metadata->>'icp_headcount_override')::boolean,false)
              or coalesce(public.company_verified_headcount_floor(c.id),0)>=greatest(50,sp.min_employee_count)
            )
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
  'Decision gate v3: verified real entity + company-level 50+ headcount evidence + non-QA production Search Profile/explicit ICP approval + credit/receivables/tech fit.';

revoke all on function public.is_company_origination_icp_eligible(uuid) from public,anon,authenticated;
grant execute on function public.is_company_origination_icp_eligible(uuid) to service_role;

-- Reconcile current entities without deleting any evidence or analytics history.
do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.reconcile_company_origination_eligibility(r.id);
  end loop;
end;
$$;

notify pgrst,'reload schema';
