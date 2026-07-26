-- Pipeline is a decision surface. Only evidence-backed companies explicitly
-- approved by the Company Master may be read or mutated through operational
-- surfaces. Historical rows are preserved, but become inaccessible until the
-- underlying company is eligible again.

-- Revalidate eligibility on every mutation. The previous trigger only fired
-- when company_id changed, allowing stage/next_action updates on legacy mock
-- rows that already existed.
drop trigger if exists pipeline_company_decision_guard on public.pipeline;
create trigger pipeline_company_decision_guard
before insert or update on public.pipeline
for each row execute function public.enforce_company_decision_eligibility();

-- Direct authenticated reads must follow the same eligibility rule used by the
-- backend service. service_role retains full visibility for audits and repairs.
drop policy if exists authenticated_select on public.pipeline;
create policy authenticated_select
on public.pipeline
for select
to authenticated
using (
  (select auth.uid()) is not null
  and public.is_company_decision_eligible(company_id)
);

-- Keep the Kanban view fail-closed for direct Supabase consumers.
create or replace view public.pipeline_kanban
with (security_invoker = true)
as
select
  p.id as pipeline_id,
  p.company_id,
  c.trade_name,
  c.legal_name,
  c.domain,
  c.sector,
  c.sub_sector,
  p.stage,
  p.status,
  p.owner_name,
  p.priority,
  p.next_action,
  p.next_action_due_at,
  p.last_contact_at,
  p.expected_ticket,
  p.expected_structure,
  ls.total_score as score_total,
  lls.lead_score,
  lls.priority_tier,
  p.created_at,
  p.updated_at
from public.pipeline p
join public.companies c on c.id = p.company_id
left join public.latest_score_snapshots ls on ls.company_id = c.id
left join public.latest_lead_score_snapshots lls on lls.company_id = c.id
where public.is_company_decision_eligible(c.id);

revoke all on public.pipeline_kanban from public, anon;
grant select on public.pipeline_kanban to authenticated, service_role;

-- Migration 096 released an invalid candidate link but intentionally preserved
-- the violation. Resolve it once the candidate is demonstrably unlinked and no
-- longer promoted, while retaining the original observed_value for audit.
update public.data_quality_violations violation
set
  status = 'resolved',
  resolved_at = now(),
  observed_value = coalesce(violation.observed_value, '{}'::jsonb) || jsonb_build_object(
    'auto_resolved_at', now(),
    'resolution', 'candidate_unlinked_from_ineligible_company'
  )
where violation.rule_code = 'candidate_linked_to_ineligible_company'
  and violation.entity_table = 'discovered_company_candidates'
  and violation.status = 'open'
  and exists (
    select 1
    from public.discovered_company_candidates candidate
    where candidate.id::text = violation.entity_id
      and candidate.company_id is null
      and candidate.candidate_status <> 'promoted'
  );

notify pgrst, 'reload schema';
