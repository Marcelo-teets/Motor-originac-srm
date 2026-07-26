-- The trigger must keep SECURITY DEFINER because it synchronizes an approved
-- human credit review into the protected Company Master. It is not an RPC and
-- must never be callable directly through PostgREST by anon/authenticated roles.

revoke execute on function public.sync_company_credit_review_metadata() from public;
revoke execute on function public.sync_company_credit_review_metadata() from anon, authenticated;
grant execute on function public.sync_company_credit_review_metadata() to service_role;

comment on function public.sync_company_credit_review_metadata() is
  'Trigger-only synchronization of approved credit review metadata. Direct RPC execution is restricted to service_role.';

notify pgrst, 'reload schema';
