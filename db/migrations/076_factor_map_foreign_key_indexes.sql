create index if not exists idx_source_factor_rules_factor_id on public.source_factor_rules(factor_id);
create index if not exists idx_company_factor_observations_factor_id on public.company_factor_observations(factor_id);
create index if not exists idx_company_factor_observations_rule_id on public.company_factor_observations(rule_id);
create index if not exists idx_public_dataset_resource_checkpoints_source_id on public.public_dataset_resource_checkpoints(source_id);
create index if not exists idx_public_dataset_runs_source_id on public.public_dataset_runs(source_id);
