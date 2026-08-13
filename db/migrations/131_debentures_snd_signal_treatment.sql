insert into public.source_treatment_rules (
  source_code,signal_type,signal_family,strength_floor,confidence_delta,
  structural_score_delta,timing_score_delta,executability_score_delta,pattern_tags,treatment_policy
)
values
  ('src_debentures_snd','capital_market_event','capital_markets',68,0.06,12,2,16,
   array['capital_market_access','existing_public_funding','structured_debt'],
   jsonb_build_object('evidenceClass','observed','guardrail','Do not infer funding gap from an issuance alone.')),
  ('src_debentures_snd','capital_market_refinancing_window','funding_need',82,0.07,8,20,12,
   array['debt_maturity_concentration','refinancing_window','capital_cycle_change'],
   jsonb_build_object('evidenceClass','observed','guardrail','Maturity is a timing trigger; funding pressure requires contextual validation.'))
on conflict (source_code,signal_type) do update set
  signal_family=excluded.signal_family,strength_floor=excluded.strength_floor,
  confidence_delta=excluded.confidence_delta,structural_score_delta=excluded.structural_score_delta,
  timing_score_delta=excluded.timing_score_delta,executability_score_delta=excluded.executability_score_delta,
  pattern_tags=excluded.pattern_tags,treatment_policy=excluded.treatment_policy;

insert into public.source_factor_rules (
  signal_type,factor_id,source_code,base_contribution,min_strength,
  confidence_floor,rule_version,rationale,active,updated_at
)
select m.signal_type,f.id,'src_debentures_snd',m.base_contribution,m.min_strength,m.confidence_floor,1,m.rationale,true,now()
from (values
  ('capital_market_event','dcm_market_access',24::numeric,65::numeric,0.85::numeric,'Registered debenture is direct evidence of DCM access.'),
  ('capital_market_event','existing_public_funding',26::numeric,65::numeric,0.85::numeric,'Registered debenture is direct evidence of existing structured debt funding.'),
  ('capital_market_event','public_funding_execution',18::numeric,65::numeric,0.85::numeric,'The source evidences an executed debt-market instrument.'),
  ('capital_market_refinancing_window','debt_maturity_concentration',30::numeric,80::numeric,0.90::numeric,'Official maturity inside the monitored horizon is a strong refinancing-timing factor.'),
  ('capital_market_refinancing_window','capital_cycle_change',22::numeric,80::numeric,0.90::numeric,'Approaching debt maturity can alter the issuer capital cycle.'),
  ('capital_market_refinancing_window','dcm_market_access',12::numeric,80::numeric,0.90::numeric,'A known DCM issuer approaching maturity has a plausible refinancing path.')
) as m(signal_type,factor_code,base_contribution,min_strength,confidence_floor,rationale)
join public.origination_factor_catalog f on f.code=m.factor_code
on conflict (signal_type,factor_id,source_code,rule_version) do update set
  base_contribution=excluded.base_contribution,min_strength=excluded.min_strength,
  confidence_floor=excluded.confidence_floor,rationale=excluded.rationale,active=true,updated_at=now();
