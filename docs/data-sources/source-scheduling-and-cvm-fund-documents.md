# Source scheduling and CVM fund documents

## CVM document pipelines

| Dataset | Package | Loader | Production cadence |
|---|---|---|---|
| `cvm_fund_documents` | `fi-doc-eventual` | Direct CSV; filename resolved from the resource URL | Weekly |
| `cvm_fund_document_deliveries` | `fi-doc-entrega` | Monthly ZIPs containing CSV; current month and M-1 daily, older current-year months weekly | Daily + weekly historical refresh |

The resource-name normalizer is generic: when CKAN supplies a friendly title without an extension but the URL ends in `.csv` or `.zip`, the connector uses the URL basename. This prevents the same failure in other direct-file datasets.

## Scheduling control plane

`source_schedule_registry` assigns every catalog source to one runner and cadence. The assignment is copied into `source_catalog.metadata.schedulePolicy`, which the bounded capture target selector enforces.

Runners:

- `capital_market`: CVM capital-market loaders.
- `bounded_capture`: company/source monitoring fanout.
- `public_bulk`: large public datasets with checkpoints.
- `source_probe`: planned sources; weekly reachability or authorization-blocker probe.
- dedicated runners retained for operational audit where applicable.

Cadence groups:

- `frequent`: four times per day for RSS/news signals.
- `daily`: operational APIs, sites and current regulatory feeds.
- `weekly`: slower public/regulatory datasets and recovery cycles.
- `monthly`: heavy bulk archives.

A weekly coverage audit fails when a non-retired source has no runner, workflow or cadence. Retired sources remain in the registry with their schedule disabled for historical governance.
