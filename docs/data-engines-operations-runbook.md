# Data Engines Operations Runbook

## Manual execution
- `POST /abm/data-engines/capture/run`
- `POST /abm/data-engines/enrichment/run`
- `POST /abm/data-engines/scheduler/tick`

## Inspection
- `GET /abm/data-engines/health`
- `GET /abm/data-engines/scheduler`
- `GET /abm/data-engines/requests`
- `GET /abm/data-engines/learning`
- `GET /abm/data-engines/source-documents`

## What to monitor
- outputs written per run
- signals written per run
- low-confidence output concentration
- repeated capture requests by company
- source document growth

## Immediate response playbook
1. If outputs drop suddenly, inspect source health and latest learning events.
2. If repeated capture requests rise for a company, improve website/news connectors.
3. If source documents are stale, trigger scheduler tick manually.
4. If proposals accumulate, prioritize connector/parser upgrades on the backlog.
