# Neon Free budget protection — Motor Originação

Destination: `steep-poetry-38942951`, branch `production`. The source Supabase stays intact until source-data recovery, import, Auth/Storage migration and parity checks have passed. This feature does not attempt a premature cutover.

## Plan limits and conservative protection
Limits supplied by the 2026-09-24 Neon Free dashboard screenshot:
- 0.5 GB per project: **500,000,000 bytes** conservative decimal interpretation. 96% target: 480 MB; operational stop: **425 MB (85%)**. The optional database-side trigger blocks selected heavy writes even earlier at 400 MB (80% logical database size).
- 100 CU-hours/month/project: provider hard quotas now cap both `active_time_seconds` and `compute_time_seconds` at **306,000 seconds (85 h)**. Because every endpoint is capped at **1 CU**, the project cannot intentionally consume more than 85 CU-h before Neon suspends compute. The hourly guard remains a second layer.
- 10 branches: 96% = 9.6 branches; at most **9 branches**, and **9 is a stop condition for creating more**. Neon Free has no lower provider-side branch quota; preview cleanup plus the guard enforce the operational ceiling.
- Autoscaling up to 2 CU: **maximum 1 CU** is enforced on production, Vercel dev and project defaults. Free-plan scale-to-zero stays provider-managed at 5 minutes.

The scheduled guard reads project usage, branch count, endpoint limits and **provider quotas** from the Neon Management API. Hard quotas are now the primary safety boundary: logical size **480 MB**, active time **306,000 s**, compute time **306,000 s**, and proxy data transfer **4.25 GB**. Neon automatically suspends computes after consumption quotas are exceeded; logical-size quota blocks writes on an oversized branch. Missing or looser hard quotas fail closed. This avoids depending on billing-period timestamps that the Free project currently reports as an unusable sentinel value.

## Deploy / activate
1. Merge the PR only when `node --test scripts/neon-free-budget-guard.test.mjs` and the full repository CI pass. This *deploys the versioned guard code and GitHub Actions schedule*, not a live DB trigger or production cutover.
2. Add an appropriately scoped `NEON_API_KEY` to **GitHub Actions secrets** for this repo, never as a public repo variable or in a file. API key needs read project/branches/endpoints and permission to update endpoint sizing. Where Neon OAuth/short-lived credentials can supply equivalent auth, replace the key rather than committing it.
3. Run the GitHub Actions workflow **Neon Free Budget Guard** manually with `NEON_GUARD_ACTIVE` unset: inspect the report. If Free project usage is unavailable, obtain the missing metric from the Neon console or an approved API and update the parser before arming.
4. Only after the Motor runtime is migrated to Neon and the required metrics are confirmed, set GitHub Actions repository variable `NEON_GUARD_ACTIVE=true`. This enables endpoint-size PATCH to 1 CU and automatic disabling of nine heavy scheduled ingestion workflows on an unsafe reading. Restoration is **manual**, following verification; CI, backups and migration workflows are never disabled by the guard.
5. After migrating the *verified complete business schema*, apply `db/neon/20260924_neon_free_storage_write_guard.sql` **only to Neon** and verify that the statement-level triggers are attached to every intended existing table. It is deliberately outside `db/migrations/` to protect the still-active Supabase project. This optional SQL step is NOT yet applied.
6. Put the same budget decision at the backend's heavy-write/ingestion entry points before switching Vercel production to Neon, including Vercel cron and any other schedulers; GitHub Actions alone does not block writes originating from Vercel, manual SQL, users or external apps.

## Monitoring and response
GitHub Actions: `.github/workflows/neon-free-budget-guard.yml` checks hourly (`7 * * * *`) and after changes. `scripts/neon-free-budget-guard.mjs` makes a read-only status report (the workflow, only when armed, can adjust endpoint max to 1 CU and disable nine heavy workflows). If unknown/unsafe, the action is red and, when armed, scheduled heavy ingestion is disabled, preserving underlying data and all backups.

**Limitations:** No polling system can *guarantee* zero overshoot, including within a one-hour interval or when external writers bypass the guard. Physical Neon billed storage can exceed `pg_database_size` due to PITR, snapshots, child branches or other provider overhead. `compute_time_seconds` may be unavailable or have different accounting on different plan vintages; verify in the real project before arming. The 85% stop and optional 80% SQL trigger are headroom, not proof that the hard 96% cap can never be crossed.

Never delete snapshots/branches or historic data automatically; export and checksum first. At the first low-headroom alert, investigate branch preview churn, oldest heavy monitoring outputs, worker run frequency and archive integrity. Use the existing Drive/Sheets cold archive only once it is proven recoverable. Do not enable paid resources.

## Verification queries after SQL guard installation
```sql
SELECT pg_database_size(current_database()) AS logical_bytes;
SELECT event_object_schema, event_object_table FROM information_schema.triggers
WHERE trigger_name LIKE 'neon_free_guard_%';
```

## Remaining migration gates
Recover the blocked Supabase database dump (or support-provided backup), import and reconcile IDs/counts/checksums, migrate Auth/Storage/Data API and cron processes, perform an authenticated staging smoke test, then switch traffic. Neither this PR nor its workflow claims that the Neon production database is populated with old Supabase records.


## Live provider quotas applied on 2026-09-28

The project was updated directly through the Neon Management API with `logical_size_bytes=480000000`, `active_time_seconds=306000`, `compute_time_seconds=306000`, and `data_transfer_bytes=4250000000`. These are provider-enforced controls, not only monitoring thresholds. Do not loosen them without an explicit architecture/capacity decision.
