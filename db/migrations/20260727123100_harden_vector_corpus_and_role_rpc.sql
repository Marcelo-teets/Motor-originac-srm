begin;

alter table public.vector_documents enable row level security;

drop policy if exists vector_documents_all_authed on public.vector_documents;
drop policy if exists vector_documents_authenticated_read on public.vector_documents;
drop policy if exists vector_documents_service_role_all on public.vector_documents;

create policy vector_documents_authenticated_read
on public.vector_documents for select to authenticated
using (true);

create policy vector_documents_service_role_all
on public.vector_documents for all to service_role
using (true)
with check (true);

revoke all privileges on table public.vector_documents from anon, authenticated;
grant select on table public.vector_documents to authenticated;

drop function if exists public.set_user_role_by_email(text, text);

comment on table public.vector_documents is
  'Internal retrieval corpus. Authenticated users may read; only trusted service jobs may mutate.';

commit;
