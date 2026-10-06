// Exact-string patches applied by scripts/apply-neon-runtime-migrations.mjs to
// historical migrations that were written for an older shape of the legacy
// schema (text ids, missing columns) and therefore do not apply verbatim on the
// Neon UUID runtime. Each patch must match at least once, so a drifted file
// fails loudly instead of silently diverging.
//
// SKIPPED lists migrations that are intentionally not replayed on Neon, with the
// reason and (when applicable) the db/neon file that replaces them.

export const PATCHES = {
  'db/migrations/030_source_treatment_impact_views.sql': [
    // company_signals.source_id became uuid; the rule key is text.
    ["sc.metadata->>'code', cs.source_id)", "sc.metadata->>'code', cs.source_id::text)"],
  ],
  'db/migrations/064_score_compatibility_columns.sql': [
    // These aliases are already plain columns in the Neon core schema.
    ['alter table public.qualification_snapshots\n  alter column qualification_score_total drop expression;', '-- neon: qualification_score_total is already a plain column'],
    ['alter table public.qualification_snapshots\n  alter column urgency_score drop expression;', '-- neon: urgency_score is already a plain column'],
    ['alter table public.lead_score_snapshots\n  alter column bucket drop expression;', '-- neon: bucket is already a plain column'],
  ],
  'db/migrations/116_harden_pipeline_eligibility_surfaces.sql': [
    // pipeline_kanban served direct PostgREST consumers of the legacy provider and joins
    // dashboard-only views (latest_score_snapshots); the Neon Data API stays default-deny.
    { removeFrom: '-- Keep the Kanban view fail-closed for direct Supabase consumers.', removeThrough: 'grant select on public.pipeline_kanban to authenticated, service_role;' },
  ],
  'db/migrations/132_fidcs_source_and_catalog_governance.sql': [
    // 022 already created an index with this name but a different predicate ("metadata ? 'code'"),
    // so "if not exists" skipped it and the ON CONFLICT below had no matching arbiter.
    ['create unique index if not exists uq_source_catalog_metadata_code\n', 'create unique index if not exists uq_source_catalog_metadata_code_nonempty\n'],
  ],
  'db/migrations/151_candidate_entity_resolution_v5_conflict_constraint.sql': [
    // 150 writes "on conflict (company_id,discovered_candidate_id)" (space after "conflict");
    // the original position() probe only matched the no-space spelling and always raised.
    ["elsif position('on conflict(company_id,discovered_candidate_id)' in lower(v_definition)) > 0 then", "elsif lower(v_definition) ~ 'on\\s+conflict\\s*\\(\\s*company_id\\s*,\\s*discovered_candidate_id\\s*\\)' then"],
  ],
  'db/migrations/152_regulated_issuer_identity_calibration.sql': [
    // The probe text was copied from the live function layout; 150 in the repository is formatted differently.
    ["  v_old text := $old$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92))$old$;\n  v_new text := $new$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and (\n          coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92\n          or (\n            c.candidate_role='operating_issuer'\n            and c.cvm_code is not null\n            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null\n            and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.90\n          )\n        )))$new$;", "  -- neon: matched against the repository text of 150 (the live function had a different layout)\n  v_old text := $old$(c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain'\n          and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92)$old$;\n  v_new text := $new$(c.raw_payload #>> '{website_identity_capture,matchType}'='name_and_domain' and (\n          coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.92\n          or (\n            c.candidate_role='operating_issuer'\n            and c.cvm_code is not null\n            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null\n            and coalesce(nullif(c.raw_payload #>> '{website_identity_capture,confidence}','')::numeric,0)>=0.90\n          )\n        ))$new$;"],
  ],
  'db/migrations/113_reclassify_empty_successful_capture_runs.sql': [
    // The diagnostics view only existed as a dashboard object in the legacy provider and is not used by the runtime.
    ["comment on view public.gold_source_connector_run_diagnostics is\n  'Connector run diagnostics. Completed runs with zero outputs are valid empty results and resolve to needs_review, not failed.';", '-- neon: gold_source_connector_run_diagnostics is not part of the Neon runtime'],
  ],
};

const applyPatch = (file, current, patch) => {
  if (Array.isArray(patch)) {
    const [from, to] = patch;
    if (!current.includes(from)) throw new Error(`Neon patch for ${file} no longer matches: ${from}`);
    return current.split(from).join(to);
  }
  const start = current.indexOf(patch.removeFrom);
  const end = start < 0 ? -1 : current.indexOf(patch.removeThrough, start);
  if (start < 0 || end < 0) throw new Error(`Neon removal for ${file} no longer matches: ${patch.removeFrom}`);
  return `${current.slice(0, start)}-- neon: removed block "${patch.removeFrom.slice(0, 60)}"${current.slice(end + patch.removeThrough.length)}`;
};

export const applyMigrationPatches = (file, sql) => (PATCHES[file] ?? [])
  .reduce((current, patch) => applyPatch(file, current, patch), sql);
