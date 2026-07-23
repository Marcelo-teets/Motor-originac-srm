-- Transactional write guards for decision outputs.
-- Historical/demo rows remain readable, but no new qualification, pattern,
-- score, ranking, thesis or pipeline state may be written for an ineligible
-- Company Master entity.

create or replace function public.enforce_company_decision_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    raise exception using
      errcode = '23514',
      message = format('%s.company_id is required by the decision quality gate', tg_table_name),
      detail = 'Decision outputs must reference an explicitly eligible real company.';
  end if;

  if not public.is_company_decision_eligible(new.company_id) then
    raise exception using
      errcode = '23514',
      message = format('company %s is not eligible for %s', new.company_id, tg_table_name),
      detail = 'Company Master row is mock, partial, synthetic or explicitly excluded from decision engines.',
      hint = 'Promote and validate the company first; set metadata.data_status=real and metadata.decision_eligible=true only after evidence-backed review.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_company_decision_eligibility() is
  'Blocks decision-engine writes for mock, partial, synthetic or non-approved Company Master entities.';

revoke all on function public.enforce_company_decision_eligibility() from public, anon, authenticated;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'qualification_snapshots',
    'company_patterns',
    'score_snapshots',
    'lead_score_snapshots',
    'ranking_v2',
    'thesis_outputs',
    'pipeline'
  ]
  loop
    v_trigger := format('%s_company_decision_guard', v_table);
    execute format('drop trigger if exists %I on public.%I', v_trigger, v_table);
    execute format(
      'create trigger %I before insert or update of company_id on public.%I for each row execute function public.enforce_company_decision_eligibility()',
      v_trigger,
      v_table
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
