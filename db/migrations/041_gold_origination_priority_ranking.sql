-- Aplicada no banco vivo via Supabase MCP em 2026-06-12. Espelho de linhagem — não reexecutar.
create or replace view public.gold_origination_priority_ranking
with (security_invoker = on) as
WITH latest_momentum AS (
         SELECT DISTINCT ON (gold_company_signal_momentum.company_id) gold_company_signal_momentum.company_id,
            gold_company_signal_momentum.ref_month,
            gold_company_signal_momentum.signals_total,
            gold_company_signal_momentum.delta_mensal,
            gold_company_signal_momentum.media_movel_3m,
            gold_company_signal_momentum.funding_need_signals,
            gold_company_signal_momentum.fit_signals,
            gold_company_signal_momentum.origination_temperature
           FROM gold_company_signal_momentum
          ORDER BY gold_company_signal_momentum.company_id, gold_company_signal_momentum.ref_month DESC
        )
 SELECT p.company_id,
    p.canonical_cnpj,
    p.company_name,
    lm.origination_temperature,
    lm.ref_month AS ultimo_mes,
    lm.signals_total AS sinais_ultimo_mes,
    COALESCE(lm.delta_mensal, 0) AS aceleracao_mensal,
    lm.funding_need_signals,
    lm.fit_signals,
    p.source_count,
    p.strongest_feature_score,
    p.avg_confidence_score,
    p.latest_evidence_at,
    round(0.30 * LEAST(COALESCE(lm.signals_total, 0), 400)::numeric / 4.0 + 0.25 * LEAST(GREATEST(COALESCE(lm.delta_mensal, 0), 0), 300)::numeric / 3.0 + 0.20 * LEAST(COALESCE(p.strongest_feature_score, 0::numeric), 100::numeric) + 0.15 * LEAST(COALESCE(lm.funding_need_signals, 0) * 10 + COALESCE(lm.fit_signals, 0) * 10, 100)::numeric + 0.10 * LEAST(COALESCE(p.source_count, 0) * 20, 100)::numeric, 2) AS priority_score,
        CASE
            WHEN p.latest_evidence_at < (now() - '30 days'::interval) THEN 'evidencia_fria'::text
            WHEN lm.origination_temperature = 'hot'::text THEN 'abordar_agora'::text
            WHEN lm.origination_temperature = 'warm'::text THEN 'nutrir'::text
            ELSE 'monitorar'::text
        END AS acao_recomendada
   FROM gold_company_profiles p
     LEFT JOIN latest_momentum lm ON lm.company_id = p.company_id
  ORDER BY (round(0.30 * LEAST(COALESCE(lm.signals_total, 0), 400)::numeric / 4.0 + 0.25 * LEAST(GREATEST(COALESCE(lm.delta_mensal, 0), 0), 300)::numeric / 3.0 + 0.20 * LEAST(COALESCE(p.strongest_feature_score, 0::numeric), 100::numeric) + 0.15 * LEAST(COALESCE(lm.funding_need_signals, 0) * 10 + COALESCE(lm.fit_signals, 0) * 10, 100)::numeric + 0.10 * LEAST(COALESCE(p.source_count, 0) * 20, 100)::numeric, 2)) DESC NULLS LAST;
