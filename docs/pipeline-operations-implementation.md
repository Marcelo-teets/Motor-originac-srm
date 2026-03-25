# Pipeline Operations Implementation Blueprint

## Objective
Turn the Motor Originação operational layer into a real execution surface backed by Supabase for:
- pipeline
- activities
- tasks

This blueprint is intentionally aligned with the current official architecture:
- frontend: React + Vite
- backend: Node + TypeScript + Express
- database: Supabase / Postgres

## What already exists
The canonical schema already contains the tables `pipeline`, `activities` and `tasks`, but the app still uses partial or derived logic in critical flows.

## Target state
### Pipeline
One primary pipeline record per company, persisted in Supabase.

Suggested stages:
1. Identified
2. Prioritized
3. Outreach
4. Qualified
5. Viability Review
6. Mandate
7. Structuring
8. Distribution
9. Closed Won
10. Closed Lost
11. Recycle

### Activities
Historic activity log per company.

Suggested activity types:
- call
- meeting
- email
- whatsapp
- internal_note
- viability_review
- mandate_sent
- mandate_signed
- structuring_kickoff
- follow_up

### Tasks
Operational tasks with explicit status.

Suggested statuses:
- todo
- in_progress
- blocked
- done
- cancelled

## Backend implementation order
1. Extend backend domain types for PipelineEntry, ActivityRecord and TaskRecord.
2. Extend `PlatformRepository` with real list/create/update methods for these entities.
3. Implement Supabase persistence in `platformRepository.ts` and preserve memory fallback.
4. Refactor `PlatformService` so dashboard and pipeline summary read from persisted pipeline data, not just companies.
5. Replace simplified routes in `server.ts` with real handlers.

## Frontend implementation order
1. Stop deriving pipeline snapshot only from `/companies`.
2. Add real API client methods for:
   - `/pipeline`
   - `/activities`
   - `/tasks`
3. Update `PipelinePage.tsx` to use real pipeline stages and recent activities.
4. Optionally expose tasks in a compact executive block.

## Acceptance criteria
- moving company stage persists in Supabase
- creating activity persists in Supabase
- creating task persists in Supabase
- updating task status persists in Supabase
- pipeline summary reflects real operational state
- company detail can consume real activities

## Why this matters for the project
The Origination Intelligence Platform should not stop at intelligence.
It must convert signals, qualification and thesis into actual commercial execution.
This layer is the bridge between institutional intelligence and origination workflow.
