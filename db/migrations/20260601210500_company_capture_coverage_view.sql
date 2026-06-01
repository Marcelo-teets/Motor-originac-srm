create or replace view public.company_capture_coverage_v as
select
  c.id as company_id,
  c.trade_name,
  c.legal_name,
  c.sector,
  c.sub_sector,
  coalesce((select count(*) from public.monitoring_outputs m where m.company_id = c.id), 0)::int as monitoring_outputs_count,
  coalesce((select count(*) from public.company_signals s where s.company_id = c.id), 0)::int as company_signals_count,
  coalesce((select count(*) from public.qualification_snapshots q where q.company_id = c.id), 0)::int as qualification_snapshots_count,
  coalesce((select count(*) from public.lead_score_snapshots l where l.company_id = c.id), 0)::int as lead_score_snapshots_count
from public.companies c;
