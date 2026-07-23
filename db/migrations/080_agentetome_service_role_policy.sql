-- Keep Agentetome operation audits private while making the intended service
-- role access explicit to Supabase's database advisor.

drop policy if exists "agentetome service role access" on public.agentetome_operation_runs;

create policy "agentetome service role access"
on public.agentetome_operation_runs
for all
to service_role
using (true)
with check (true);
