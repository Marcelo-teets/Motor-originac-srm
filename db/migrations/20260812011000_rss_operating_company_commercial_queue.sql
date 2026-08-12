-- Allow explicitly funded operating companies discovered in governed media/RSS
-- to enter the commercial identity queue before they have a capital-market-event
-- issuer role. This changes routing only; identity approval, Company Master
-- promotion and credit decision eligibility remain separate human gates.

begin;

do $$
declare
  current_definition text;
  optimized_definition text;
  old_queue_rule text := $$WHEN ((candidate_base.candidate_role = 'operating_issuer'::text) AND candidate_base.commercial_queue) THEN 'commercial'::text$$;
  new_queue_rule text := $$WHEN ((candidate_base.candidate_role = ANY (ARRAY['operating_issuer'::text, 'operating_company'::text])) AND candidate_base.commercial_queue) THEN 'commercial'::text$$;
  old_action_rule text := $$WHEN candidate_role = 'operating_issuer'::text THEN 'Abrir revisão de identidade e validar funding gap, estrutura e timing.'::text$$;
  new_action_rule text := $$WHEN candidate_role = ANY (ARRAY['operating_issuer'::text, 'operating_company'::text]) THEN 'Abrir revisão de identidade e validar funding gap, estrutura e timing.'::text$$;
begin
  select pg_get_viewdef('public.candidate_decision_queue_v1'::regclass, true)
    into current_definition;

  optimized_definition := replace(current_definition, old_queue_rule, new_queue_rule);
  optimized_definition := replace(optimized_definition, old_action_rule, new_action_rule);

  if optimized_definition = current_definition then
    raise exception 'candidate_decision_queue_v1 operating-company routing signatures not found; refusing silent migration drift';
  end if;

  optimized_definition := regexp_replace(optimized_definition, ';\s*$', '');

  execute 'create or replace view public.candidate_decision_queue_v1 with (security_invoker=true) as '
    || optimized_definition;
end
$$;

comment on view public.candidate_decision_queue_v1 is
  'Candidate decision queue. operating_company candidates enter commercial routing only when commercial_queue=true from explicit, audited evidence; human identity and credit gates remain mandatory.';

commit;
