# Database Growth Circuit Breaker

## Purpose

Protect the canonical Motor Originação PostgreSQL database from storage exhaustion without making the analytical decision layer unavailable.

The guard applies only to high-volume raw/heavy tables:

- `monitoring_outputs`
- `source_documents`
- `capital_market_events`
- `bronze_historical_records`

It intentionally does **not** gate `company_signals`, qualification, score, lead score or ranking history.

## Modes

- **normal**: raw writes proceed.
- **degraded**: rows larger than the configured per-row budget are rejected.
- **block_raw**: raw/heavy inserts and growing updates are rejected.
- shrinking updates are always allowed, so archive/prune cleanup can continue.

## Default thresholds

The migration starts conservatively at:

- soft: 400 MiB
- hard: 450 MiB
- degraded row cap: 256 KiB

These are operational defaults, not provider-plan assumptions. After the data plane recovers, confirm the real storage entitlement and adjust with:

`private.configure_database_growth_guard(soft_bytes, hard_bytes, row_cap_bytes)`

Only `service_role` can call the configuration and refresh functions.

## Refresh model

The database size is sampled by a low-frequency pg_cron job twice per hour. A write path refreshes the state only if the cached measurement is older than 30 minutes.

This avoids calling `pg_database_size()` for every insert.

## Recovery

When the guard blocks raw writes:

1. keep decision-critical tables online;
2. process only already-verified historical archive/prune operations;
3. confirm database size fell below the soft threshold;
4. call `private.refresh_database_growth_guard()`;
5. resume ingestion gradually.

Do not use `VACUUM FULL` on a storage-constrained production database without a maintenance plan.
