-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
alter view public.bronze_source_documents_raw set (security_invoker = on);
alter view public.bronze_company_signals_raw set (security_invoker = on);
alter view public.bronze_monitoring_outputs_raw set (security_invoker = on);
alter view public.silver_source_documents_deduped set (security_invoker = on);
alter view public.silver_company_signals_normalized set (security_invoker = on);
alter view public.silver_monitoring_outputs_normalized set (security_invoker = on);
alter view public.gold_company_signal_features set (security_invoker = on);
alter view public.gold_company_source_features set (security_invoker = on);
alter view public.gold_company_profiles set (security_invoker = on);
alter view public.gold_source_connector_run_diagnostics set (security_invoker = on);
