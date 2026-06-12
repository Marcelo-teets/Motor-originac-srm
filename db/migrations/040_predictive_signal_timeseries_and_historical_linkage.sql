-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
create or replace view public.gold_company_signal_monthly_features
with (security_invoker = on) as
select
  f.company_id,
  f.canonical_cnpj,
  f.company_name,
  date_trunc('month', f.observed_at)::date as ref_month,
  count(*)::integer as signals_total,
  count(distinct f.signal_type)::integer as signal_type_diversity,
  count(distinct f.source_id)::integer as source_diversity,
  round(avg(f.signal_strength), 2) as avg_strength,
  round(avg(f.confidence_score), 2) as avg_confidence,
  max(f.feature_score) as max_feature_score,
  count(*) filter (where f.signal_type in ('fidc_fit_signal','dcm_fit_signal'))::integer as fit_signals,
  count(*) filter (where f.signal_type in ('receivables_detected','credit_product_detected'))::integer as credit_evidence_signals,
  count(*) filter (where f.signal_type in ('funding_gap_signal','capital_mismatch'))::integer as funding_need_signals
from public.gold_company_signal_features f
where f.observed_at is not null
group by 1,2,3,4;

create or replace view public.gold_company_signal_momentum
with (security_invoker = on) as
select
  m.company_id,
  m.canonical_cnpj,
  m.company_name,
  m.ref_month,
  m.signals_total,
  m.signals_total - lag(m.signals_total) over (partition by m.company_id order by m.ref_month) as delta_mensal,
  round(avg(m.signals_total) over (partition by m.company_id order by m.ref_month rows between 2 preceding and current row), 2) as media_movel_3m,
  m.funding_need_signals,
  m.fit_signals,
  case
    when m.funding_need_signals > 0 and m.fit_signals > 0 then 'hot'
    when m.funding_need_signals > 0 or m.fit_signals > 0 then 'warm'
    else 'cold'
  end as origination_temperature
from public.gold_company_signal_monthly_features m;

create or replace view public.gold_company_historical_evidence
with (security_invoker = on) as
select
  a.company_id,
  a.alias_value as canonical_cnpj,
  b.dataset_code,
  b.ref_date,
  b.record_key,
  b.payload,
  b.source_url,
  b.ingested_at
from public.company_entity_aliases a
join public.bronze_historical_records b
  on b.entity_cnpj = a.alias_value
where a.alias_type = 'cnpj';
