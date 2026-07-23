-- Authenticated read gate for Company Master decision readiness.
-- Historical synthetic rows remain auditable, but user-facing decision screens
-- consume this snapshot before rendering leads, scores, ranking or pipeline.

create or replace function public.company_decision_readiness_snapshot()
returns jsonb
language sql
security invoker
stable
set search_path = public
as $$
  with company_state as (
    select
      count(*)::int as total_companies,
      count(*) filter (where public.is_company_decision_eligible(id))::int as eligible_companies,
      count(*) filter (where coalesce((metadata->>'synthetic_seed')::boolean, false))::int as demo_companies,
      count(*) filter (
        where not coalesce((metadata->>'synthetic_seed')::boolean, false)
          and not public.is_company_decision_eligible(id)
      )::int as unapproved_companies,
      coalesce(
        jsonb_agg(id order by trade_name) filter (where public.is_company_decision_eligible(id)),
        '[]'::jsonb
      ) as eligible_ids
    from public.companies
  ), historical_counts as (
    select 'qualificationSnapshots' as key, count(*)::int as value
    from public.qualification_snapshots x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
    union all
    select 'leadScoreSnapshots', count(*)::int
    from public.lead_score_snapshots x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
    union all
    select 'scoreSnapshots', count(*)::int
    from public.score_snapshots x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
    union all
    select 'companyPatterns', count(*)::int
    from public.company_patterns x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
    union all
    select 'rankingRows', count(*)::int
    from public.ranking_v2 x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
    union all
    select 'pipelineRows', count(*)::int
    from public.pipeline x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
    union all
    select 'thesisOutputs', count(*)::int
    from public.thesis_outputs x join public.companies c on c.id=x.company_id
    where not public.is_company_decision_eligible(c.id)
  ), historical_state as (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) as payload
    from historical_counts
  ), quality_state as (
    select count(*)::int as open_violations, max(detected_at) as latest_event
    from public.data_quality_violations
    where status='open' and entity_table='companies'
  ), candidate_state as (
    select
      count(*)::int as total,
      count(*) filter (where cnpj is not null and regexp_replace(cnpj, '\D', '', 'g') <> '')::int as with_cnpj,
      count(*) filter (where candidate_status='captured')::int as captured,
      count(*) filter (where candidate_status in ('review','needs_review'))::int as review,
      count(*) filter (where candidate_status='promoted')::int as promoted,
      max(captured_at) as latest_capture
    from public.discovered_company_candidates
  ), evidence_state as (
    select
      count(*)::int as records,
      count(*) filter (where company_id is not null)::int as linked_records,
      count(*) filter (where company_id is null)::int as unlinked_records,
      count(distinct entity_cnpj) filter (where entity_cnpj is not null)::int as distinct_cnpjs,
      max(observed_at) as latest_observed
    from public.public_company_records
  )
  select jsonb_build_object(
    'status', case when c.eligible_companies > 0 then 'ready' else 'blocked_no_real_companies' end,
    'gateOpen', c.eligible_companies > 0,
    'qualityGateVersion', 1,
    'companyMaster', jsonb_build_object(
      'totalCompanies', c.total_companies,
      'eligibleCompanies', c.eligible_companies,
      'demoCompanies', c.demo_companies,
      'unapprovedCompanies', c.unapproved_companies,
      'eligibleCompanyIds', c.eligible_ids
    ),
    'quality', jsonb_build_object(
      'openCompanyViolations', q.open_violations,
      'latestQualityEventAt', q.latest_event,
      'writeGuardsActive', (
        select count(*)=7 from pg_trigger
        where not tgisinternal and tgname like '%_company_decision_guard'
      )
    ),
    'historicalExcludedRows', h.payload,
    'candidateQueue', jsonb_build_object(
      'total', d.total,
      'withCnpj', d.with_cnpj,
      'captured', d.captured,
      'review', d.review,
      'promoted', d.promoted,
      'latestCaptureAt', d.latest_capture
    ),
    'publicEvidence', jsonb_build_object(
      'records', e.records,
      'linkedRecords', e.linked_records,
      'unlinkedRecords', e.unlinked_records,
      'distinctCnpjs', e.distinct_cnpjs,
      'latestObservedAt', e.latest_observed
    ),
    'policy', jsonb_build_object(
      'historicalRowsVisibleForAudit', true,
      'historicalRowsVisibleAsCurrentLeads', false,
      'automaticPromotion', false,
      'requiresCnpjReconciliation', true,
      'requiresEvidenceReview', true
    ),
    'nextActions', jsonb_build_array(
      jsonb_build_object('code','capture_real_candidates','label','Capturar candidatas reais','route','/capture-inbox','priority',1),
      jsonb_build_object('code','reconcile_company_identity','label','Reconciliar CNPJ, nome e domínio','route','/sources','priority',2),
      jsonb_build_object('code','approve_company_promotion','label','Promover após revisão de evidência','route','/capture-inbox','priority',3)
    ),
    'generatedAt', now()
  )
  from company_state c
  cross join historical_state h
  cross join quality_state q
  cross join candidate_state d
  cross join evidence_state e;
$$;

comment on function public.company_decision_readiness_snapshot() is
  'Service-role snapshot used to block decision screens when Company Master has no eligible real companies.';
revoke all on function public.company_decision_readiness_snapshot() from public, anon, authenticated;
grant execute on function public.company_decision_readiness_snapshot() to service_role;
notify pgrst, 'reload schema';
