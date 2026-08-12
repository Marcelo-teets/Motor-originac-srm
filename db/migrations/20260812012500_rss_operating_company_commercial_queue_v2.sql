-- Complete the RSS operating-company commercial routing change after the
-- previous migration updated only the next-action signature. This migration is
-- intentionally versioned separately because the prior migration has already
-- been recorded in production.

begin;

do $migration$
declare
  current_definition text;
  optimized_definition text;
  old_queue_rule text := $rule$WHEN candidate_base.candidate_role = 'operating_issuer'::text AND candidate_base.commercial_queue THEN 'commercial'::text$rule$;
  new_queue_rule text := $rule$WHEN candidate_base.candidate_role = ANY (ARRAY['operating_issuer'::text, 'operating_company'::text]) AND candidate_base.commercial_queue THEN 'commercial'::text$rule$;
  queue_changed boolean;
begin
  select pg_get_viewdef('public.candidate_decision_queue_v1'::regclass, true)
    into current_definition;

  if position(old_queue_rule in current_definition) = 0 then
    raise exception 'candidate_decision_queue_v1 queue routing signature not found; refusing silent migration drift';
  end if;

  optimized_definition := replace(current_definition, old_queue_rule, new_queue_rule);
  queue_changed := optimized_definition <> current_definition;

  if not queue_changed then
    raise exception 'candidate_decision_queue_v1 queue routing replacement produced no change';
  end if;

  if position(new_queue_rule in optimized_definition) = 0 then
    raise exception 'candidate_decision_queue_v1 new operating-company queue routing was not materialized';
  end if;

  optimized_definition := regexp_replace(optimized_definition, ';\s*$', '');

  execute 'create or replace view public.candidate_decision_queue_v1 with (security_invoker=true) as '
    || optimized_definition;
end
$migration$;

comment on view public.candidate_decision_queue_v1 is
  'Candidate decision queue. Explicit RSS/media funding triggers may route operating_company candidates to commercial identity work, while identity approval, Company Master promotion and credit decision eligibility remain separate human gates.';

commit;
