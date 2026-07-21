-- 051_vc_portfolio_monitor_activation.sql
-- Activates the first-party VC portfolio monitor registered by migration 022
-- under the canonical code src_vc_portfolio_monitor (status was 'planned').
-- No re-registration: only status flip, default portfolio pages and the
-- treatment rule for the venture_backed signal the 022 contract declares.

update public.source_catalog
set
  status = 'real',
  health = 'healthy',
  metadata = metadata || jsonb_build_object(
    'portfolios', jsonb_build_array(
      jsonb_build_object('fund', 'Kaszek', 'url', 'https://www.kaszek.com/companies'),
      jsonb_build_object('fund', 'Monashees', 'url', 'https://monashees.com.br/en/portfolio'),
      jsonb_build_object('fund', 'Canary', 'url', 'https://canary.com.br/portfolio'),
      jsonb_build_object('fund', 'Astella', 'url', 'https://www.astella.com.br/portfolio'),
      jsonb_build_object('fund', 'Valor Capital Group', 'url', 'https://valorcapitalgroup.com/portfolio')
    )
  )
where metadata->>'code' = 'src_vc_portfolio_monitor'
  and not (metadata ? 'portfolios');

insert into public.source_treatment_rules (
  source_code,
  signal_type,
  signal_family,
  strength_floor,
  confidence_delta,
  structural_score_delta,
  timing_score_delta,
  executability_score_delta,
  pattern_tags,
  treatment_policy
)
values
  ('src_vc_portfolio_monitor','venture_backed','growth',74,0.05,3,6,4,array['growth_without_funding','expansion_outpacing_capital'],'{"output":"company_signals","qualification_use":"venture backing confirms institutional support and anticipates funding pressure; corroborate with funding-round recency"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
