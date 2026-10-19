-- A2 / Motor V5: documented primary-source evidence is NOT human identity approval.
-- The resolver may link other automatically verified companies, but must never
-- promote a candidate explicitly quarantined for human identity review.
-- This patch edits only the existing, versioned resolver using its current
-- PostgreSQL definition. If the upstream routine changes, fail closed.
do $migration$
declare
  v_before text;
  v_after text;
  v_anchor constant text := $anchor$and c.candidate_role in ('operating_company','operating_issuer')$anchor$;
  v_guard constant text := $guard$
      -- A2 evidence-only records are pending human legal-entity reconciliation.
      and lower(coalesce(c.raw_payload->>'human_identity_review_required','false')) <> 'true'
      and lower(coalesce(c.raw_payload->>'humanApprovalRequired','false')) <> 'true'
      and lower(coalesce(c.raw_payload->>'companyMasterPromotionAuthorized','true')) <> 'false'
      and lower(coalesce(c.raw_payload->>'identity_review_status','')) <> 'pending'
      and lower(coalesce(c.raw_payload #>> '{official_corporate_terms,human_identity_review_required}','false')) <> 'true'
      and lower(coalesce(c.raw_payload->>'commercial_queue','true')) <> 'false'$guard$;
begin
  select pg_get_functiondef(
    'public.auto_resolve_verified_candidate_entities_v4(integer)'::regprocedure
  ) into v_before;

  if v_before is null then
    raise exception 'a2_resolver_missing_refuse_unreviewed_patch';
  end if;

  if position(v_guard in v_before) > 0 then
    -- Reruns remain harmless; this is NOT an identity approval.
    return;
  end if;

  if (length(v_before) - length(replace(v_before, v_anchor, '')))
     <> length(v_anchor)
     or position('from public.candidate_decision_queue_v4 c' in v_before) = 0
     or position('c.raw_payload' in v_before) = 0
  then
    raise exception 'a2_resolver_definition_changed_refuse_unreviewed_patch';
  end if;

  v_after := replace(v_before, v_anchor, v_anchor || v_guard);
  execute v_after;
end;
$migration$;

comment on function public.auto_resolve_verified_candidate_entities_v4(integer)
  is 'Deterministic resolver. Source-only A2 identities marked human_identity_review_required or commercial_queue=false are NEVER auto-promoted. Human approval via canonical identity review remains separate.';
