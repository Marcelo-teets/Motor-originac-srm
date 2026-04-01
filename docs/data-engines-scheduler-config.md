# Data Engines Scheduler Configuration

## Required envs
- `ENABLE_DATA_ENGINE_SCHEDULER=true`
- `DATA_ENGINE_SCHEDULER_INTERVAL_MS=900000`

## Recommended starting point
- interval: 15 minutes for early validation
- use Supabase enabled in non-local environments
- inspect `/abm/data-engines/scheduler` after deploy
- trigger `/abm/data-engines/scheduler/tick` once after startup

## Operational checks
1. confirm scheduler started=true
2. confirm outputsWritten grows after a tick
3. confirm source-documents list is non-empty
4. confirm learning events are being persisted
