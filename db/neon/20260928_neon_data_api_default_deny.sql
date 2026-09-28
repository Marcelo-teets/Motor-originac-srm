-- Neon Data API default-deny hardening.
-- Applied live on 2026-09-28 to production branch br-bold-pond-b6vde4xj.
-- Prevents future business tables/functions from becoming broadly accessible
-- through authenticated/anonymous Data API roles before RLS/policies are reviewed.

revoke all on schema public from anonymous, authenticated;
revoke all privileges on all tables in schema public from anonymous, authenticated;
revoke all privileges on all sequences in schema public from anonymous, authenticated;
revoke all privileges on all functions in schema public from anonymous, authenticated;

alter default privileges for role neondb_owner in schema public
  revoke all on tables from authenticated;
alter default privileges for role neondb_owner in schema public
  revoke all on sequences from authenticated;
alter default privileges for role neondb_owner in schema public
  revoke execute on functions from authenticated;

-- Do not grant anything here. Application grants and RLS policies must be
-- introduced deliberately after the Neon Auth migration and user-ownership
-- model are validated against the current Motor schema.
