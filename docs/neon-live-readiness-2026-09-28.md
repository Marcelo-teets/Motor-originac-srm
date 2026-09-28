# Neon live readiness — 2026-09-28

Project: `steep-poetry-38942951` — **MOTOR - ORIGINAÇÃO**  
Default branch: `production` / `br-bold-pond-b6vde4xj`  
Region: `aws-sa-east-1`  
Postgres: 18  
Plan: `free_v3`

## Live controls already applied

- Hard project logical-size quota: **480,000,000 bytes** (96% of 0.5 GB decimal plan allowance).
- Hard active-time quota: **306,000 seconds (85 h)** across the project.
- Hard compute-time quota: **306,000 seconds**, paired with max **1 CU** endpoints.
- Hard proxy data-transfer quota: **4,250,000,000 bytes (85% of 5 GB)**.
- Project default autoscaling: **0.25–1 CU**.
- Production compute: **0.25–1 CU**, transaction pooler enabled.
- Vercel dev compute: **0.25–1 CU**, transaction pooler enabled.
- Free-plan scale-to-zero remains provider-managed/fixed; the account rejected manual suspend-interval changes.
- Neon Auth: active (Better Auth), email/password enabled, Google shared OAuth present.
- Trusted production origin: `https://motor-originac-srm.vercel.app`.
- Neon Data API: active for `public`, max 1000 rows, Neon Auth provider, server timing enabled.
- Neon Data API permissions: **default-deny applied live** to `anonymous` and `authenticated`; future grants must be introduced only with reviewed RLS policies.
- Current business schema in production: not yet applied. Production currently contains Neon Auth tables only. **The tested portable base is not full live-schema parity because the historical Supabase production uses UUID IDs for `companies` and `source_catalog`, while the old canonical `db/schema.sql` started with text IDs. Do not apply the old base to production as final schema.**
- Object Storage: unavailable in this Neon region through the branchable-storage platform; do not assume Supabase Storage can be replaced by Neon Storage here.

## Measured project state during setup

- Synthetic storage: ~34 MB.
- Compute counters: zero at project level before active migration testing.
- Branches before migration tests: 2 (`production`, `vercel-dev`).
- Two temporary migration branches were created to test schema portability. Their computes were explicitly suspended after testing to conserve the Free plan.
- Canonical portable schema test: 41 public business tables + 9 Neon Auth tables.
- Extensions verified on temp branch: `pgcrypto`, `vector 0.8.6`.
- Deferred `match_vector_documents` function was created and verified on the temp branch.

## Important migration boundary

The Supabase source project `hdghpmssudrqhsbvrdyt` still returns `Connection terminated due to connection timeout` for SQL and table/migration reads. No production records have been claimed as migrated.

The portable schema is versioned in:
- `db/neon/20260928_neon_base_business_schema.sql`
- `db/neon/20260928_neon_match_vector_documents.sql`

The base schema was prepared and validated on a temporary Neon branch. Applying it to `production` requires the explicit completion step of the Neon migration workflow. Do not interpret schema deployment as data migration.

## Remaining blockers before cutover

1. Apply the tested base schema to Neon production after explicit approval.
2. Recover Supabase production data (dump/read-only window/support backup) and import preserving IDs and timestamps.
3. Reconcile schema evolution beyond the canonical base against the 229 versioned migrations, prioritizing tables consumed by live backend paths.
4. Adapt runtime persistence and authentication away from Supabase-specific REST/Auth assumptions.
5. Replace/relocate Supabase Storage usage because Neon branchable storage is unavailable in this region.
6. Replace `pg_cron` jobs with governed GitHub/Vercel/Neon scheduling.
7. End-to-end preview smoke, parity counts/checksums, final delta, controlled cutover, rollback.

## Free-plan safety invariant

The provider-level 480 MB logical-size quota is the strongest protection currently applied. The hourly GitHub guard remains a second layer and must fail closed when telemetry is unavailable. Compute usage cannot be guaranteed solely by a polling workflow; max compute is therefore capped to 1 CU and heavy ingestion is designed to stop early.


## Identity-contract correction

Repository evidence (`docs/capture-persistence-smoke.md`, migrations 031/048 and later) proves the former Supabase live contract uses UUID primary keys for `companies.id` and `source_catalog.id`; logical connector IDs such as `src_*` live in `source_catalog.metadata.code`. Therefore the old canonical text-ID bootstrap is only a portability probe. A production Neon schema must be reconstructed against the UUID live contract before cutover.
