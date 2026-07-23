-- Company Master decision-quality gate.
-- Demo companies remain available for local/mock fallback, but production
-- engines and entity resolution must consume only explicitly eligible rows.

with demo_companies as (
  select id
  from public.companies
  where id in (
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'a2000000-0000-0000-0000-000000000002'::uuid,
    'a3000000-0000-0000-0000-000000000003'::uuid,
    'a4000000-0000-0000-0000-000000000004'::uuid,
    'a5000000-0000-0000-0000-000000000005'::uuid,
    'a6000000-0000-0000-0000-000000000006'::uuid,
    'a7000000-0000-0000-0000-000000000007'::uuid,
    'a8000000-0000-0000-0000-000000000008'::uuid
  )
)
update public.companies c
set metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
  'data_status', 'mock',
  'synthetic_seed', true,
  'decision_eligible', false,
  'excluded_from_entity_resolution', true,
  'excluded_from_monitoring', true,
  'excluded_from_qualification', true,
  'excluded_from_scoring', true,
  'decision_eligibility_reason', 'synthetic_demo_seed',
  'quality_gate_version', 1
),
updated_at = now()
from demo_companies d
where c.id = d.id;

insert into public.data_quality_violations (
  rule_code,
  entity_table,
  entity_id,
  severity,
  status,
  reason,
  observed_value
)
select
  'company_master_synthetic_seed',
  'companies',
  c.id::text,
  'high',
  'open',
  'Empresa demonstrativa não pode alimentar entity resolution, qualification, patterns, score, ranking ou pipeline de originação real.',
  jsonb_build_object(
    'trade_name', c.trade_name,
    'legal_name', c.legal_name,
    'cnpj', c.cnpj,
    'data_status', c.metadata->>'data_status',
    'decision_eligible', c.metadata->>'decision_eligible'
  )
from public.companies c
where coalesce((c.metadata->>'synthetic_seed')::boolean, false)
  and not exists (
    select 1
    from public.data_quality_violations v
    where v.rule_code = 'company_master_synthetic_seed'
      and v.entity_table = 'companies'
      and v.entity_id = c.id::text
      and v.status = 'open'
  );

create or replace function public.is_company_decision_eligible(p_company_id uuid)
returns boolean
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(
    (
      select
        coalesce(c.metadata->>'data_status', 'partial') = 'real'
        and coalesce((c.metadata->>'decision_eligible')::boolean, false)
        and not coalesce((c.metadata->>'synthetic_seed')::boolean, false)
        and not coalesce((c.metadata->>'excluded_from_entity_resolution')::boolean, false)
        and not coalesce((c.metadata->>'excluded_from_qualification')::boolean, false)
        and not coalesce((c.metadata->>'excluded_from_scoring')::boolean, false)
      from public.companies c
      where c.id = p_company_id
    ),
    false
  );
$$;

comment on function public.is_company_decision_eligible(uuid) is
  'Canonical Company Master quality gate. Returns true only for explicitly real, non-synthetic companies approved for resolution and decision engines.';

revoke all on function public.is_company_decision_eligible(uuid) from public, anon, authenticated;
grant execute on function public.is_company_decision_eligible(uuid) to service_role;

create or replace view public.company_master_decision_eligible_v1
with (security_invoker = true)
as
select c.*
from public.companies c
where public.is_company_decision_eligible(c.id);

comment on view public.company_master_decision_eligible_v1 is
  'Canonical Company Master input for entity resolution, monitoring, qualification, patterns, scoring and ranking.';

revoke all on public.company_master_decision_eligible_v1 from public, anon, authenticated;
grant select on public.company_master_decision_eligible_v1 to service_role;

notify pgrst, 'reload schema';
