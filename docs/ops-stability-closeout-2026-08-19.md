# Stability closeout — 2026-08-19

## Scheduler ownership

- **Company/source capture:** GitHub Actions `Capture Data` is the primary scheduler and direct runner.
- **Vercel:** keeps the capture endpoint for compatibility/manual use, but no longer schedules the duplicate daily capture.
- **Supabase pg_cron:** remains the downstream queue/maintenance scheduler, with workloads staggered to reduce connection contention.
- **Google cold archive:** GitHub Actions remains the primary migration worker; push-triggered runs are hard-limited to one part and never delete staging.

## pg_cron stabilization

Production symptoms before this change included `statement timeout`, `job startup timeout`, REST connection timeouts and serverless 30-second deadlines.

Changes are deliberately conservative and reversible:

| Job | Before | After |
|---|---|---|
| historical-excel-reconcile | every 15 min | minute 7 and 37 |
| historical-excel-queue | minute 15 hourly | minute 13 hourly |
| agentetome-due-export-refresh | minute 17 hourly | minute 27 hourly |
| origination-derived-reprocessing | every 5 min, batch 25 | every 10 min, batch 15 |
| candidate-automatic-entity-resolution | every 15 min, batch 50 | minute 9 and 39, batch 25 |

No source is disabled and no data is deleted.

## Google cold archive canary

A push to `main` caused by this closeout executes:

1. repository-secret completeness check;
2. Google OAuth refresh-token exchange;
3. Drive archive-root metadata probe;
4. Sheets catalog metadata probe;
5. at most one real archive part migration;
6. `DELETE_STAGING=false` unconditionally on push.

The workflow must not reveal OAuth tokens or secret values.

## Node runtime

The canonical application runtime is Node 24.x, matching Vercel production. CI runs the full quality gate on Node 24 before this change may merge.

## Rollback

If queue latency becomes unacceptable after the database stabilizes, revert only the pg_cron migration schedules/commands to their documented baseline. Do not re-enable the duplicate Vercel capture scheduler unless GitHub Actions is unavailable and a deliberate failover is approved.
