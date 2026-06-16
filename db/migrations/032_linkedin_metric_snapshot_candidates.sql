-- 032_linkedin_metric_snapshot_candidates.sql

create or replace view public.linkedin_metric_snapshot_candidates as
select
  mo.id as monitoring_output_id,
  mo.company_id,
  mo.source_id,
  mo.created_at as observed_at,
  mo.confidence_score,
  mo.normalized_payload #> '{metadata,linkedinMetrics}' as linkedin_metrics,
  nullif(mo.normalized_payload #>> '{metadata,linkedinMetrics,followersCount}', '')::numeric as followers_count,
  nullif(mo.normalized_payload #>> '{metadata,linkedinMetrics,employeeCount}', '')::numeric as employee_count,
  nullif(mo.normalized_payload #>> '{metadata,linkedinMetrics,employeeCountRange}', '') as employee_count_range,
  nullif(mo.normalized_payload #>> '{metadata,linkedinMetrics,creditRelatedKeywordHits}', '')::numeric as credit_related_keyword_hits,
  mo.normalized_payload #> '{metadata,linkedinMetrics,creditRelatedKeywords}' as credit_related_keywords
from public.monitoring_outputs mo
where mo.normalized_payload #> '{metadata,linkedinMetrics}' is not null;
