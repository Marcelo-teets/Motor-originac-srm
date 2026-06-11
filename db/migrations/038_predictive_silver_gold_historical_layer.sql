-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
create or replace function public.safe_to_numeric(p text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or btrim(p) = '' then null
    when p ~ '^-?\d+(\.\d+)?$' then p::numeric
    when p ~ '^-?[\d\.]+,\d+$' then replace(replace(p, '.', ''), ',', '.')::numeric
    when p ~ '^-?\d+,\d+$' then replace(p, ',', '.')::numeric
    else null
  end;
$$;

create or replace view public.silver_fidc_monthly_snapshots
with (security_invoker = on) as
select
  b.entity_cnpj as fund_cnpj,
  b.ref_date as competencia,
  coalesce(b.payload->>'DENOM_SOCIAL', b.payload->>'NM_FUNDO') as fund_name,
  public.safe_to_numeric(coalesce(b.payload->>'VL_PATRIM_LIQ', b.payload->>'VL_PL')) as patrimonio_liquido,
  public.safe_to_numeric(b.payload->>'VL_TOTAL') as carteira_total,
  public.safe_to_numeric(coalesce(b.payload->>'VL_DIREITO_AQUIS_INADIMPL', b.payload->>'VL_INADIMPL')) as valor_inadimplente,
  public.safe_to_numeric(b.payload->>'NR_COTST') as num_cotistas,
  b.payload,
  b.source_url,
  b.ingested_at
from public.bronze_historical_records b
where b.dataset_code = 'cvm_fidc_inf_mensal'
  and b.entity_cnpj is not null
  and b.ref_date is not null;

create or replace view public.silver_macro_credit_features
with (security_invoker = on) as
select
  date_trunc('month', ref_date)::date as ref_month,
  max(value) filter (where series_code = '20714') as saldo_credito_pj,
  max(value) filter (where series_code = '21082') as inadimplencia_pj,
  max(value) filter (where series_code = '21112') as spread_icc,
  max(value) filter (where series_code = '25434') as concessoes_pj
from public.macro_series_observations
group by 1;

create or replace view public.gold_fidc_market_benchmark
with (security_invoker = on) as
select
  competencia,
  count(distinct fund_cnpj)::integer as fundos_reportando,
  sum(patrimonio_liquido) as pl_total_mercado,
  percentile_cont(0.5) within group (order by patrimonio_liquido) as pl_mediano,
  sum(valor_inadimplente) as inadimplencia_total,
  case when sum(carteira_total) > 0
    then round(100.0 * sum(valor_inadimplente) / sum(carteira_total), 4)
    else null end as taxa_inadimplencia_mercado_pct
from public.silver_fidc_monthly_snapshots
group by competencia;

create or replace view public.gold_company_predictive_features
with (security_invoker = on) as
select
  p.company_id,
  p.canonical_cnpj,
  p.company_name,
  p.signal_count,
  p.source_count,
  p.document_count,
  p.latest_evidence_at,
  p.strongest_feature_score,
  p.avg_confidence_score,
  m.ref_month as macro_ref_month,
  m.saldo_credito_pj,
  m.inadimplencia_pj,
  m.spread_icc,
  m.concessoes_pj
from public.gold_company_profiles p
left join lateral (
  select * from public.silver_macro_credit_features
  order by ref_month desc limit 1
) m on true;
