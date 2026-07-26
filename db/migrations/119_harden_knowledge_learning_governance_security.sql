-- The learning eligibility helper is an internal trigger/worker primitive, not a
-- public authenticated RPC. Runtime-state visibility is restricted to service_role.

revoke execute on function public.is_company_learning_eligible(uuid) from public, anon, authenticated;
grant execute on function public.is_company_learning_eligible(uuid) to service_role;

drop policy if exists service_role_manage_knowledge_learning_runtime_state on public.knowledge_learning_runtime_state;
create policy service_role_manage_knowledge_learning_runtime_state
on public.knowledge_learning_runtime_state
for all
to service_role
using (true)
with check (true);

revoke all on public.knowledge_learning_runtime_state from public, anon, authenticated;
grant select, insert, update on public.knowledge_learning_runtime_state to service_role;

notify pgrst, 'reload schema';
