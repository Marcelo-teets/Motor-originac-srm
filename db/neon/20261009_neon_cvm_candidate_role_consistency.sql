-- Align canonical candidate_role with the role already classified in raw_payload.
-- Applies only to CVM event candidates. No candidate is approved or promoted.
-- The dedicated trigger runs after candidate_commercial_semantics_guard
-- (PostgreSQL fires triggers of the same kind alphabetically).

create or replace function public.sync_cvm_candidate_role_column()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role text;
begin
  if coalesce(new.source_ref, '') not like 'capital_market_event:%' then
    return new;
  end if;

  v_role := new.raw_payload->>'candidate_role';
  if v_role in ('market_vehicle', 'financial_intermediary', 'operating_issuer', 'needs_classification') then
    new.candidate_role := v_role;
  else
    -- Unclassified CVM records must never default to operating_company.
    new.candidate_role := 'needs_classification';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_cvm_candidate_role_column() from public, anon, authenticated;
grant execute on function public.sync_cvm_candidate_role_column() to service_role;

drop trigger if exists zz_sync_cvm_candidate_role_column on public.discovered_company_candidates;
create trigger zz_sync_cvm_candidate_role_column
before insert or update of source_ref, company_name, legal_name, company_type, credit_product, raw_payload, candidate_role
on public.discovered_company_candidates
for each row execute function public.sync_cvm_candidate_role_column();

-- Identity and promotion checks remain untouched; only the role label is reconciled.
update public.discovered_company_candidates
set candidate_role = case
  when raw_payload->>'candidate_role' in ('market_vehicle','financial_intermediary','operating_issuer','needs_classification')
    then raw_payload->>'candidate_role'
  else 'needs_classification'
end
where source_ref like 'capital_market_event:%'
  and candidate_role is distinct from case
    when raw_payload->>'candidate_role' in ('market_vehicle','financial_intermediary','operating_issuer','needs_classification')
      then raw_payload->>'candidate_role'
    else 'needs_classification'
  end;
