-- Knowledge Learning Agent: PostgREST v9+ exposes JWT claims through
-- request.jwt.claims and switches the database role to the JWT role.
-- The legacy request.jwt.claim.role GUC is no longer reliable and caused
-- valid service_role calls to be rejected in production.

do $migration$
declare
  function_record record;
  original_definition text;
  corrected_definition text;
  legacy_guard constant text := 'coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''';
  current_guard constant text := 'current_user <> ''service_role''';
begin
  for function_record in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) like '%request.jwt.claim.role%'
      and p.proname in (
        'knowledge_agent_sync_links',
        'knowledge_agent_upsert_node',
        'knowledge_claim_learning_jobs',
        'knowledge_fail_learning_run',
        'knowledge_finish_learning_run',
        'knowledge_learning_context',
        'knowledge_start_learning_run',
        'validate_knowledge_reference'
      )
  loop
    original_definition := pg_get_functiondef(function_record.oid);
    corrected_definition := replace(original_definition, legacy_guard, current_guard);

    if corrected_definition = original_definition then
      raise exception 'Legacy service-role guard was not replaced for function %', function_record.proname;
    end if;

    execute corrected_definition;
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_functiondef(p.oid) like '%request.jwt.claim.role%'
      and p.proname in (
        'knowledge_agent_sync_links',
        'knowledge_agent_upsert_node',
        'knowledge_claim_learning_jobs',
        'knowledge_fail_learning_run',
        'knowledge_finish_learning_run',
        'knowledge_learning_context',
        'knowledge_start_learning_run',
        'validate_knowledge_reference'
      )
  ) then
    raise exception 'Legacy JWT role detection remains in Knowledge Learning Agent functions';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
