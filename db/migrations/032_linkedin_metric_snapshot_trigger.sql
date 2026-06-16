-- 032_linkedin_metric_snapshot_trigger.sql
-- Persists LinkedIn metric snapshots automatically from monitoring_outputs.
-- This keeps the capture runtime simple: when a LinkedIn output carries normalized_payload.metadata.linkedinMetrics,
-- Supabase materializes company-level metrics and aggregate role-family snapshots.

create or replace function public.persist_linkedin_snapshots_from_monitoring_output()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metrics jsonb;
  v_observed_at timestamptz;
  v_confidence numeric(5,2);
  v_keyword text;
  v_role_family text;
begin
  v_metrics := coalesce(new.normalized_payload #> '{metadata,linkedinMetrics}', new.payload #> '{metadata,linkedinMetrics}');

  if v_metrics is null or jsonb_typeof(v_metrics) <> 'object' then
    return new;
  end if;

  if new.company_id is null or new.source_id is null then
    return new;
  end if;

  v_observed_at := coalesce(new.observed_at, new.created_at, now());
  v_confidence := coalesce(nullif(v_metrics->>'metricsConfidence', '')::numeric, nullif(new.confidence_score::text, '')::numeric, 0.65);

  insert into public.company_source_metric_snapshots (
    company_id, source_id, metric_key, metric_value, metric_text, metric_unit,
    observed_at, confidence_score, observed_vs_inferred, raw_payload
  )
  values
    (new.company_id, new.source_id, 'linkedin_followers_count', nullif(v_metrics->>'followersCount', '')::numeric, null, 'count', v_observed_at, v_confidence, 'observed', jsonb_build_object('monitoring_output_id', new.id, 'linkedinMetrics', v_metrics)),
    (new.company_id, new.source_id, 'linkedin_employee_count', nullif(v_metrics->>'employeeCount', '')::numeric, null, 'count', v_observed_at, v_confidence, 'observed', jsonb_build_object('monitoring_output_id', new.id, 'linkedinMetrics', v_metrics)),
    (new.company_id, new.source_id, 'linkedin_employee_count_range', null, nullif(v_metrics->>'employeeCountRange', ''), 'range', v_observed_at, v_confidence, 'observed', jsonb_build_object('monitoring_output_id', new.id, 'linkedinMetrics', v_metrics)),
    (new.company_id, new.source_id, 'linkedin_credit_related_keyword_hits', nullif(v_metrics->>'creditRelatedKeywordHits', '')::numeric, null, 'count', v_observed_at, v_confidence, 'observed', jsonb_build_object('monitoring_output_id', new.id, 'linkedinMetrics', v_metrics))
  on conflict (company_id, source_id, metric_key, observed_at) do update set
    metric_value = excluded.metric_value,
    metric_text = excluded.metric_text,
    confidence_score = excluded.confidence_score,
    raw_payload = excluded.raw_payload;

  if jsonb_typeof(v_metrics->'creditRelatedKeywords') = 'array' then
    for v_keyword in select jsonb_array_elements_text(v_metrics->'creditRelatedKeywords') loop
      v_role_family := case
        when lower(v_keyword) like '%collection%' or lower(v_keyword) like '%cobran%' then 'collections'
        when lower(v_keyword) like '%underwrit%' then 'underwriting'
        when lower(v_keyword) like '%risk%' or lower(v_keyword) like '%risco%' then 'risk'
        when lower(v_keyword) like '%treasury%' or lower(v_keyword) like '%tesour%' or lower(v_keyword) like '%funding%' then 'treasury'
        when lower(v_keyword) like '%capital%' then 'capital_markets'
        else 'credit'
      end;

      insert into public.company_linkedin_role_snapshots (
        company_id, source_id, linkedin_company_url, role_family, role_title,
        employee_count, profile_sample_size, observed_at, confidence_score, raw_payload
      )
      values (
        new.company_id,
        new.source_id,
        coalesce(new.url, new.normalized_payload->>'sourceUrl', new.normalized_payload->>'canonicalUrl'),
        v_role_family,
        null,
        null,
        1,
        v_observed_at,
        v_confidence,
        jsonb_build_object('monitoring_output_id', new.id, 'keyword', v_keyword, 'linkedinMetrics', v_metrics)
      )
      on conflict do nothing;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_persist_linkedin_snapshots_from_monitoring_outputs on public.monitoring_outputs;
create trigger trg_persist_linkedin_snapshots_from_monitoring_outputs
after insert or update of normalized_payload on public.monitoring_outputs
for each row
execute function public.persist_linkedin_snapshots_from_monitoring_output();
