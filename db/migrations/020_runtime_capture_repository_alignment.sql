alter table public.monitoring_outputs
  add column if not exists output_payload jsonb not null default '{}'::jsonb,
  add column if not exists normalized_payload jsonb not null default '{}'::jsonb,
  add column if not exists confidence_score numeric,
  add column if not exists connector_status text not null default 'partial',
  add column if not exists observed_vs_inferred text not null default 'observed';

update public.monitoring_outputs
set output_payload = jsonb_build_object('title', title, 'summary', summary)
where output_payload = '{}'::jsonb;

update public.monitoring_outputs
set normalized_payload = coalesce(payload, '{}'::jsonb)
where normalized_payload = '{}'::jsonb;

update public.monitoring_outputs
set confidence_score = coalesce(confidence_score, source_confidence / 100.0, 0);

alter table public.company_signals
  add column if not exists source_id uuid references public.source_catalog(id),
  add column if not exists signal_strength numeric,
  add column if not exists confidence_score numeric,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb,
  add column if not exists observed_vs_inferred text not null default 'observed';

update public.company_signals
set
  signal_strength = coalesce(signal_strength, strength, 0),
  confidence_score = coalesce(confidence_score, confidence / 100.0, 0),
  evidence_payload = case
    when evidence_payload = '{}'::jsonb then coalesce(metadata, '{}'::jsonb) || jsonb_build_object('note', evidence_text, 'sourceUrl', evidence_url)
    else evidence_payload
  end;

alter table public.pattern_catalog
  add column if not exists pattern_name text,
  add column if not exists pattern_family text,
  add column if not exists explicit_features text[] not null default '{}'::text[],
  add column if not exists latent_features text[] not null default '{}'::text[],
  add column if not exists default_qualification_impact numeric not null default 8,
  add column if not exists default_lead_score_impact numeric not null default 10,
  add column if not exists default_ranking_impact numeric not null default 8;

update public.pattern_catalog
set
  pattern_name = coalesce(pattern_name, name),
  pattern_family = coalesce(pattern_family, category),
  default_qualification_impact = greatest(default_qualification_impact, default_weight * 8),
  default_lead_score_impact = greatest(default_lead_score_impact, default_weight * 10),
  default_ranking_impact = greatest(default_ranking_impact, default_weight * 8);

alter table public.company_patterns
  add column if not exists confidence_score numeric,
  add column if not exists qualification_impact numeric not null default 0,
  add column if not exists lead_score_impact numeric not null default 0,
  add column if not exists ranking_impact numeric not null default 0,
  add column if not exists thesis_impact text,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb;

update public.company_patterns
set confidence_score = coalesce(confidence_score, confidence / 100.0, 0);

alter table public.score_snapshots
  add column if not exists score_type text,
  add column if not exists score_value numeric,
  add column if not exists rationale text,
  add column if not exists version integer not null default 1;

update public.score_snapshots
set
  score_type = coalesce(score_type, 'qualification'),
  score_value = coalesce(score_value, total_score),
  rationale = coalesce(rationale, 'Runtime score snapshot.');

alter table public.lead_score_snapshots
  add column if not exists source_confidence numeric,
  add column if not exists trigger_strength numeric,
  add column if not exists pattern_score numeric;

alter table public.qualification_snapshots
  add column if not exists credit_product_type text,
  add column if not exists credit_is_core_product boolean,
  add column if not exists receivables_type text[] not null default '{}'::text[],
  add column if not exists receivables_recurrence_level text,
  add column if not exists receivables_predictability_level text,
  add column if not exists has_securitization_structure boolean,
  add column if not exists has_existing_debt_structure boolean,
  add column if not exists funding_structure_type text,
  add column if not exists capital_structure_quality text,
  add column if not exists capital_structure_rationale text,
  add column if not exists funding_gap_level text,
  add column if not exists capital_dependency_level text,
  add column if not exists growth_vs_funding_mismatch text,
  add column if not exists fit_other_structure text,
  add column if not exists governance_maturity_level text,
  add column if not exists risk_model_maturity_level text,
  add column if not exists underwriting_maturity_level text,
  add column if not exists operational_maturity_level text,
  add column if not exists unit_economics_quality text,
  add column if not exists spread_vs_funding_quality text,
  add column if not exists concentration_risk_level text,
  add column if not exists delinquency_signal_level text,
  add column if not exists timing_intensity_level text,
  add column if not exists execution_readiness_level text,
  add column if not exists qualification_score_structural numeric,
  add column if not exists qualification_score_capital numeric,
  add column if not exists qualification_score_receivables numeric,
  add column if not exists qualification_score_execution numeric,
  add column if not exists qualification_score_timing numeric,
  add column if not exists confidence_score numeric,
  add column if not exists rationale_summary text,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb;

update public.qualification_snapshots
set
  credit_is_core_product = coalesce(credit_is_core_product, credit_is_core),
  has_existing_debt_structure = coalesce(has_existing_debt_structure, uses_structured_debt),
  capital_structure_quality = coalesce(capital_structure_quality, capital_structure_fit),
  funding_gap_level = coalesce(funding_gap_level, case when funding_gap then 'high' else 'low' end),
  qualification_score_structural = coalesce(qualification_score_structural, structural_need_score),
  qualification_score_timing = coalesce(qualification_score_timing, timing_score),
  qualification_score_execution = coalesce(qualification_score_execution, executability_score),
  rationale_summary = coalesce(rationale_summary, rationale),
  evidence_payload = case when evidence_payload = '{}'::jsonb then coalesce(evidence, '[]'::jsonb) else evidence_payload end;
