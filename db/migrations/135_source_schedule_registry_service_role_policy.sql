begin;

drop policy if exists source_schedule_registry_service_role_all
  on public.source_schedule_registry;

create policy source_schedule_registry_service_role_all
  on public.source_schedule_registry
  for all
  to service_role
  using (true)
  with check (true);

commit;
