alter table public.monitoring_outputs
  add column if not exists output_payload jsonb not null default '{}'::jsonb,
  add column if not exists normalized_payload jsonb not null default '{}'::jsonb,
  add column if not exists confidence_score numeric,
  add column if not exists connector_status text not null default 'partial',
  add column if not exists observed_vs_inferred text not null default 'observed';

alter table public.company_signals
  add column if not exists source_id uuid references public.source_catalog(id),
  add column if not exists signal_strength numeric,
  add column if not exists confidence_score numeric,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb,
  add column if not exists observed_vs_inferred text not null default 'observed';

alter table public.pattern_catalog
  add column if not exists pattern_name text,
  add column if not exists pattern_family text,
  add column if not exists explicit_features text[] not null default '{}'::text[],
  add column if not exists latent_features text[] not null default '{}'::text[],
  add column if not exists default_qualification_impact numeric not null default 8,
  add column if not exists default_lead_score_impact numeric not null default 10,
  add column if not exists default_ranking_impact numeric not null default 8;

alter table public.company_patterns
  add column if not exists confidence_score numeric,
  add column if not exists qualification_impact numeric not null default 0,
  add column if not exists lead_score_impact numeric not null default 0,
  add column if not exists ranking_impact numeric not null default 0,
  add column if not exists thesis_impact text,
  add column if not exists evidence_payload jsonb not null default '{}'::jsonb;

alter table public.score_snapshots
  add column if not exists score_type text,
  add column if not exists score_value numeric,
  add column if not exists rationale text,
  add column if not exists version integer not null default 1;

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
