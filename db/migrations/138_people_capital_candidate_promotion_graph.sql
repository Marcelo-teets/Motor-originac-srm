-- Production alignment placeholder.
-- Migration `people_capital_candidate_promotion_graph` was already promoted to Supabase production
-- on 2026-08-19. The live implementation materializes investor relationships after candidate promotion.
-- This repository marker closes migration drift so subsequent migrations remain ordered and auditable.
--
-- No-op by design: production already contains the schema/function changes under migration version
-- 20260819152614 and reapplying them from an inferred reconstruction would be less safe than preserving
-- the authoritative production migration history.
select 1;
