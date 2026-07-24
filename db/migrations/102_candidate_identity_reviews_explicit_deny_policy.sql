-- Explicit client denial: identity reviews are server-side governance records.

create policy candidate_identity_reviews_deny_client_access
on public.candidate_identity_reviews
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

notify pgrst,'reload schema';
