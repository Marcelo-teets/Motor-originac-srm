-- MVP Closure Gate 2: v5 runtime fix.
-- The resolver returns a column named company_id; PostgreSQL therefore treats the bare
-- ON CONFLICT(company_id, ...) target as ambiguous inside PL/pgSQL. Rebind the already
-- validated v4 definition to the named UNIQUE constraint instead of column inference.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.auto_resolve_verified_candidate_entities_v4(integer)'::regprocedure)
    into v_definition;

  if v_definition is null then
    raise exception 'auto_resolve_verified_candidate_entities_v4(integer) is missing';
  end if;

  if position('ON CONFLICT (company_id, discovered_candidate_id)' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'ON CONFLICT (company_id, discovered_candidate_id)',
      'ON CONFLICT ON CONSTRAINT company_discovery_links_company_candidate_unique'
    );
  elsif position('on conflict(company_id,discovered_candidate_id)' in lower(v_definition)) > 0 then
    v_definition := regexp_replace(
      v_definition,
      'on\s+conflict\s*\(\s*company_id\s*,\s*discovered_candidate_id\s*\)',
      'ON CONFLICT ON CONSTRAINT company_discovery_links_company_candidate_unique',
      'i'
    );
  end if;

  if position('company_discovery_links_company_candidate_unique' in v_definition) = 0 then
    raise exception 'Could not bind resolver ON CONFLICT to named constraint';
  end if;

  execute v_definition;
end;
$$;
