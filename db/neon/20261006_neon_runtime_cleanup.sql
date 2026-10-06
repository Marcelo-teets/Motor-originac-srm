-- Neon runtime cleanup after the legacy replay.
-- Superseded entity resolvers: only auto_resolve_verified_candidate_entities_v4 is
-- scheduled (149/150/151/152). The earlier versions still reference "company_id"
-- ambiguously (plpgsql_check: column reference "company_id" is ambiguous), so any
-- manual call would fail at runtime. Nothing in the database or the codebase calls them.

begin;

drop function if exists public.auto_resolve_verified_candidate_entities(integer);
drop function if exists public.auto_resolve_verified_candidate_entities_v3(integer);
drop function if exists public.auto_resolve_verified_operating_issuers(integer);

commit;
