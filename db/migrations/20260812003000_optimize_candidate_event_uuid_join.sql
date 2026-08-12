-- Fix the root performance issue in candidate_decision_queue_v1.
--
-- Before this migration the view joined capital_market_events with:
--   event.id::text = candidate.raw_payload->>'latestEventId'
-- which prevents use of the UUID primary-key index and forces a scan/sort of
-- the full capital_market_events table. At current production volume, the
-- filtered P1/P2 query took ~20.7s and exceeded PostgREST's statement timeout.
--
-- We preserve the view contract and scoring logic, changing only the join to
-- safely cast the JSON identifier to UUID on the candidate side. PostgreSQL can
-- then use capital_market_events_pkey for bounded index lookups.

begin;

do $$
declare
  current_definition text;
  optimized_definition text;
  old_join text := $$event.id::text = (candidate.raw_payload ->> 'latestEventId'::text)$$;
  new_join text := $$event.id = CASE
    WHEN COALESCE(candidate.raw_payload ->> 'latestEventId'::text, ''::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text
      THEN (candidate.raw_payload ->> 'latestEventId'::text)::uuid
    ELSE NULL::uuid
  END$$;
begin
  select pg_get_viewdef('public.candidate_decision_queue_v1'::regclass, true)
    into current_definition;

  optimized_definition := replace(current_definition, old_join, new_join);

  if optimized_definition = current_definition then
    raise exception 'candidate_decision_queue_v1 event join signature not found; refusing silent migration drift';
  end if;

  optimized_definition := regexp_replace(optimized_definition, ';\s*$', '');

  execute 'create or replace view public.candidate_decision_queue_v1 with (security_invoker=true) as '
    || optimized_definition;
end
$$;

comment on view public.candidate_decision_queue_v1 is
  'Candidate decision queue base view. latestEventId is cast safely on the candidate side so capital_market_events UUID PK lookups remain indexable.';

commit;
