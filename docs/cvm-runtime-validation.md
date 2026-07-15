# CVM runtime validation

The protected post-deploy canary validates the exact production commit and only succeeds when current CVM offering rows are persisted. Capital-market ingestion uses a single active run per dataset, incremental resource fingerprints, and separate stale thresholds for manual versus scheduled/backfill executions.
