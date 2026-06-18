begin;

alter table public.company_source_metric_snapshots enable row level security;
alter table public.company_linkedin_role_snapshots enable row level security;

revoke all on table public.company_source_metric_snapshots from anon, authenticated;
revoke all on table public.company_linkedin_role_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.company_source_metric_snapshots to service_role;
grant select, insert, update, delete on table public.company_linkedin_role_snapshots to service_role;

drop policy if exists service_role_full_access_company_source_metric_snapshots on public.company_source_metric_snapshots;
create policy service_role_full_access_company_source_metric_snapshots
  on public.company_source_metric_snapshots
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_full_access_company_linkedin_role_snapshots on public.company_linkedin_role_snapshots;
create policy service_role_full_access_company_linkedin_role_snapshots
  on public.company_linkedin_role_snapshots
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists idx_company_linkedin_role_snapshots_source
  on public.company_linkedin_role_snapshots (source_id);

commit;

-- Rollback:
-- drop index if exists public.idx_company_linkedin_role_snapshots_source;
-- drop policy if exists service_role_full_access_company_linkedin_role_snapshots on public.company_linkedin_role_snapshots;
-- drop policy if exists service_role_full_access_company_source_metric_snapshots on public.company_source_metric_snapshots;
