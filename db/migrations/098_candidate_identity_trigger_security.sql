-- Trigger functions execute internally and must never be exposed as RPCs.
revoke all on function public.enforce_candidate_identity_quality() from public, anon, authenticated;
notify pgrst,'reload schema';
