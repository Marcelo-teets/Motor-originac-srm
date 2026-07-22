update public.source_catalog
set metadata=metadata||jsonb_build_object(
  'officialProbePassed',true,
  'officialProbePassedAt',now(),
  'officialProbeRuntime','github_actions_pure_node',
  'officialProbeValidation',jsonb_build_array(
    'official_resource_discovered',
    'archive_downloaded',
    'zip_bounds_validated',
    'crc_validated',
    'compatible_entries_opened',
    'rows_scanned_gt_zero'
  ),
  'implementationPhase','official_archive_probe_passed_pending_production_deploy_and_real_cnpj'
),
status='partial',
health='degraded',
updated_at=now()
where metadata->>'code'='src_cvm_fre_capital_structure';

update public.source_catalog
set metadata=metadata||jsonb_build_object(
  'gitHubSecretsConfigured',false,
  'companyMasterRealCnpjReady',false,
  'implementationPhase','runtime_ready_blocked_by_repository_secrets_and_real_cnpj'
),
status='partial',
health='degraded',
updated_at=now()
where metadata->>'code'='src_rfb_qsa_bulk';
