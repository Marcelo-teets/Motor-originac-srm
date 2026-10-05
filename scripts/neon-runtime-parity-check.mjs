import pg from 'pg';

const connectionString = process.env.MOTOR_NEON_DATABASE_URL || process.env.DATABASE_URL || '';
if (!connectionString) {
  console.error('MOTOR_NEON_DATABASE_URL or DATABASE_URL is required.');
  process.exit(2);
}

const requiredRelations = [
  'public.companies',
  'public.source_catalog',
  'public.source_connector_runs',
  'public.monitoring_outputs',
  'public.company_signals',
  'public.enrichments',
  'public.qualification_snapshots',
  'public.company_patterns',
  'public.score_snapshots',
  'public.lead_score_snapshots',
  'public.pipeline',
  'public.user_profiles',
  'public.capital_market_events',
  'public.microsoft_connections',
  'public.microsoft_task_links',
  'public.microsoft_sync_runs',
  'public.dcm_daily_leads',
  'public.dcm_outreach_feedback',
  'public.dcm_daily_outreach_queue_v',
  'public.data_archive_runs',
  'public.data_archive_parts',
  'public.data_archive_policies',
  'public.data_archive_tokens',
  'public.source_schedule_coverage',
  'public.source_control_sheet_v1',
  'public.capital_market_ingestion_health',
  'public.knowledge_nodes',
  'public.knowledge_links',
  'public.knowledge_node_versions',
  'public.knowledge_saved_views',
  'public.knowledge_references',
  'public.knowledge_embedding_jobs',
  'public.knowledge_learning_jobs',
  'public.knowledge_learning_runs',
  'private.database_growth_guard_state',
];

const requiredFunctions = [
  ['auth', 'uid'],
  ['auth', 'jwt'],
  ['auth', 'role'],
  ['public', 'knowledge_list_nodes'],
  ['public', 'knowledge_get_node'],
  ['public', 'knowledge_save_node'],
  ['public', 'knowledge_archive_node'],
  ['public', 'knowledge_graph_snapshot'],
  ['public', 'knowledge_list_saved_views'],
  ['public', 'knowledge_save_view'],
  ['public', 'knowledge_delete_view'],
  ['public', 'knowledge_company_workspace'],
  ['public', 'knowledge_company_execution_workspace'],
  ['public', 'knowledge_create_execution_action'],
  ['public', 'knowledge_complete_execution_action'],
  ['public', 'knowledge_capture_signal_note'],
  ['public', 'knowledge_capture_monitoring_output_note'],
  ['public', 'knowledge_capture_qualification_note'],
  ['public', 'knowledge_outcome_intelligence'],
  ['public', 'knowledge_outcome_operations'],
  ['public', 'knowledge_adopt_existing_activity'],
  ['public', 'knowledge_capture_existing_activity_outcome'],
  ['public', 'knowledge_learning_status'],
  ['public', 'knowledge_enqueue_company_learning'],
  ['public', 'knowledge_embedding_coverage'],
  ['public', 'knowledge_hybrid_search'],
  ['public', 'knowledge_claim_embedding_jobs'],
  ['public', 'knowledge_complete_embedding_job'],
  ['public', 'knowledge_fail_embedding_job'],
  ['public', 'agentetome_runtime_status'],
  ['public', 'agentetome_admin_manifest_secure'],
  ['public', 'queue_agentetome_admin_export'],
  ['public', 'record_agentetome_validation_audit'],
  ['public', 'fidcs_runtime_status'],
  ['public', 'persist_fidcs_validation'],
  ['public', 'assert_ingestion_storage_budget'],
];

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000,
  application_name: 'motor-neon-runtime-parity',
});

try {
  const relationRows = await pool.query(
    `select requested.name,
            to_regclass(requested.name) is not null as present
       from unnest($1::text[]) as requested(name)`,
    [requiredRelations],
  );
  const functionRows = await pool.query(
    `select requested.schema_name,
            requested.function_name,
            exists (
              select 1
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = requested.schema_name
                 and p.proname = requested.function_name
            ) as present
       from unnest($1::text[], $2::text[]) as requested(schema_name, function_name)`,
    [
      requiredFunctions.map(([schema]) => schema),
      requiredFunctions.map(([, name]) => name),
    ],
  );

  const missingRelations = relationRows.rows.filter((row) => !row.present).map((row) => row.name);
  const missingFunctions = functionRows.rows
    .filter((row) => !row.present)
    .map((row) => `${row.schema_name}.${row.function_name}`);

  const report = {
    provider: 'neon',
    database: (await pool.query('select current_database() as name')).rows[0]?.name ?? 'unknown',
    relationsChecked: relationRows.rows.length,
    functionsChecked: functionRows.rows.length,
    missingRelations,
    missingFunctions,
    ready: missingRelations.length === 0 && missingFunctions.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
} finally {
  await pool.end();
}
