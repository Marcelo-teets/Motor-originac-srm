-- Preserve the first observation of a vacancy across recurrent upserts.
create or replace function public.preserve_company_job_first_seen()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  new.first_seen_at := old.first_seen_at;
  if new.opened_at is null then
    new.opened_at := old.opened_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_preserve_company_job_first_seen on public.company_job_openings;
create trigger trg_preserve_company_job_first_seen
before update on public.company_job_openings
for each row execute function public.preserve_company_job_first_seen();

revoke all on function public.preserve_company_job_first_seen() from public, anon, authenticated;
grant execute on function public.preserve_company_job_first_seen() to service_role;
