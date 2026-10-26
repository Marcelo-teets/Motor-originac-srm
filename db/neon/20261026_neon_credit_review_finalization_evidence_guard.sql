-- Defense in depth for the existing GOD-MODE credit review approval RPC.
-- PR #712 blocks nulls at the API; this trigger closes the direct SQL/RPC path.
-- Does not update any historical rows or promote/approve any entity.
create or replace function public.enforce_complete_credit_assessment_v5()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_field text;
  v_stored jsonb;
begin
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if jsonb_typeof(new.review_payload) is distinct from 'object' then
    raise exception using errcode = '23514', message = 'credit review requires an assessed JSON object';
  end if;

  -- Both stored booleans and the submitted review must show an explicit
  -- human Yes/No. Missing/JSON null cannot be interpreted as No.
  for v_field, v_stored in
    select key, value from jsonb_each(jsonb_build_object(
      'hasCreditProduct', new.has_credit_product,
      'creditIsCore', new.credit_is_core,
      'hasReceivables', new.has_receivables,
      'receivablesStructurable', new.receivables_structurable,
      'hasFidc', new.has_fidc,
      'usesStructuredDebt', new.uses_structured_debt,
      'fitFidc', new.fit_fidc,
      'fitDcm', new.fit_dcm
    ))
  loop
    if jsonb_typeof(v_stored) is distinct from 'boolean'
      or jsonb_typeof(new.review_payload->v_field) is distinct from 'boolean'
      or new.review_payload->v_field is distinct from v_stored then
      raise exception using errcode = '23514',
        message = 'credit review has an unassessed or inconsistent boolean field',
        detail = v_field;
    end if;
  end loop;

  -- Scores must be explicitly assessed by the reviewer in the same payload,
  -- not merely defaulted to zero by the persistence layer.
  for v_field, v_stored in
    select key, value from jsonb_each(jsonb_build_object(
      'structuralScore', new.structural_score,
      'capitalScore', new.capital_score,
      'receivablesScore', new.receivables_score,
      'executionScore', new.execution_score,
      'timingScore', new.timing_score
    ))
  loop
    if jsonb_typeof(v_stored) is distinct from 'number'
      or jsonb_typeof(new.review_payload->v_field) is distinct from 'number'
      or new.review_payload->v_field is distinct from v_stored then
      raise exception using errcode = '23514',
        message = 'credit review has an unassessed or inconsistent score',
        detail = v_field;
    end if;
    if (v_stored::text)::numeric not between 0 and 100 then
      raise exception using errcode = '23514',
        message = 'credit review score outside the approved 0-100 range',
        detail = v_field;
    end if;
  end loop;

  if jsonb_typeof(new.review_payload->'confidence') is distinct from 'number'
    or new.confidence not between 0 and 1
    or new.review_payload->'confidence' is distinct from to_jsonb(new.confidence) then
    raise exception using errcode = '23514',
      message = 'credit review confidence must be explicitly assessed in the 0-1 range';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_complete_credit_assessment_v5()
  from public, anon, authenticated;
grant execute on function public.enforce_complete_credit_assessment_v5()
  to service_role;

drop trigger if exists trg_enforce_complete_credit_assessment_v5
  on public.company_credit_reviews;

create trigger trg_enforce_complete_credit_assessment_v5
before insert or update
on public.company_credit_reviews
for each row
execute function public.enforce_complete_credit_assessment_v5();

-- Existing god_mode/email controls, RLS, grants and finalized rows are preserved.
