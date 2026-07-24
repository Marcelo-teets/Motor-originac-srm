-- 109_dcm_daily_outreach_view_security.sql
-- Garante que a view operacional respeite as políticas RLS das tabelas-base.

alter view if exists public.dcm_daily_outreach_queue_v
  set (security_invoker = true);

comment on view public.dcm_daily_outreach_queue_v is
  'Visão operacional da fila diária DCM; executa com os privilégios do usuário e respeita RLS.';
