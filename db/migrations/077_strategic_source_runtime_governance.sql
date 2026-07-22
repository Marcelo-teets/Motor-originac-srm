update public.source_catalog
set metadata=metadata||jsonb_build_object(
  'runtime','vercel_node_in_memory_zip',
  'scheduler','vercel_cron',
  'cronPath','/api/strategic-public-data-run',
  'cronSchedule','15 9 * * 1',
  'runtimeMaxDurationSeconds',300,
  'runtimeMemoryMb',2048,
  'requiresRealCompanyCnpj',true,
  'implementationPhase','runtime_ready_pending_official_probe_and_real_cnpj'
),
status='partial',
health='degraded',
updated_at=now()
where metadata->>'code'='src_cvm_fre_capital_structure';

update public.source_catalog
set metadata=metadata||jsonb_build_object(
  'runtime','github_actions_partitioned',
  'scheduler','github_actions_cron',
  'cronSchedule','40 9 8 * *',
  'requiredRepositorySecrets',jsonb_build_array('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'),
  'requiresRealCompanyCnpj',true,
  'implementationPhase','runtime_ready_blocked_by_repository_secrets_and_real_cnpj'
),
status='partial',
health='degraded',
updated_at=now()
where metadata->>'code'='src_rfb_qsa_bulk';
