-- 049_bcb_sgs_macro_treatment.sql
-- Activates the BCB SGS macro source at runtime level.
-- The source itself was registered by migration 022 under the canonical code
-- src_bcb_sgs (metadata->>'code'); it is NOT re-registered here.
-- This migration only adds the default series configuration and the treatment
-- rule for the macro_indexer_context signal the 022 contract already declares.

update public.source_catalog
set metadata = metadata || jsonb_build_object(
  'series', jsonb_build_array(
    jsonb_build_object('code', 432, 'name', 'Selic meta', 'unit', '% a.a.'),
    jsonb_build_object('code', 12, 'name', 'CDI diário', 'unit', '% a.d.'),
    jsonb_build_object('code', 433, 'name', 'IPCA mensal', 'unit', '% a.m.'),
    jsonb_build_object('code', 189, 'name', 'IGP-M mensal', 'unit', '% a.m.'),
    jsonb_build_object('code', 1, 'name', 'Dólar comercial (venda)', 'unit', 'BRL')
  )
)
where metadata->>'code' = 'src_bcb_sgs'
  and not (metadata ? 'series');

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
  ('src_bcb_sgs','macro_indexer_context','timing',50,0.02,0,2,1,array['timing_trigger'],'{"output":"company_signals","qualification_use":"macro context only; must not dominate score without company-level corroboration"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
