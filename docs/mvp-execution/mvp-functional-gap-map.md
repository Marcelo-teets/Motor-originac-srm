# MVP Functional Gap Map

This document maps what still needs to happen for the project to reach a functional MVP, based on the current repository state and execution lane.

## Definition of functional MVP
The MVP is considered functional only when all items below are true:

1. companies are listed from real backend data
2. monitoring outputs are persisted with provenance and timestamp
3. company signals are persisted and queryable
4. qualification and lead score snapshots are persisted
5. score history is persisted
6. thesis outputs are persisted
7. ranking is persisted and queryable
8. pipeline is persisted with official stages
9. activities and tasks are persisted
10. dashboard, company detail, ranking/leads and pipeline render from real data
11. frontend branch builds green on Vercel
12. Supabase is the active persistence path, with fallback only as controlled contingency

## Current status summary

### Already materialized in repository
- pipeline CRM migration
- ranking/thesis/score history migration
- persistence services for ranking/thesis/history
- persistence services for pipeline CRM
- bootstrap service
- bootstrap route
- payload factory
- payload examples
- intelligence snapshot route
- server patch artifact for persistence bootstrap registration

### Already solved outside this PR lane
- frontend `getMvpQuickActions` hotfix merged via PR #26

## Remaining gaps to functional MVP

### A. Database / Supabase
- apply migrations `003_pipeline_crm_core.sql` and `004_ranking_thesis_score_history.sql` in Supabase
- confirm views exist and are readable:
  - `vw_pipeline_current`
  - `vw_latest_ranking_v2`
  - `vw_latest_thesis_outputs`
- verify permissions / RLS posture for backend service-role usage

### B. Backend integration
- wire `registerMvpPersistenceBootstrap(app)` into `backend/src/server.ts`
- wire `createMvpIntelligenceSnapshotRouter()` into `backend/src/server.ts`
- connect repository/service layer so new persistence path can be called from real orchestration flows
- expose operational endpoint for intelligence snapshot in server
- update platform status endpoint to reflect new persistence capabilities

### C. Backend execution flow
- use `MvpPersistencePayloadFactory` from a real orchestration flow
- persist ranking/thesis/score history after scoring cycle
- persist pipeline/activity/task rows from commercial orchestration
- validate fallback behavior when Supabase is unavailable

### D. Frontend / UX
- confirm main branch or working preview contains the hotfix from PR #26
- ensure Dashboard consumes real backend summary
- ensure Company Detail consumes real backend detail/intelligence/thesis/score history
- ensure Leads / Ranking consumes persisted ranking snapshot or latest view
- ensure Pipeline consumes persisted pipeline snapshot instead of derived local-only view
- verify monitoring and agents pages still work after backend changes

### E. Deploy / runtime
- redeploy frontend in Vercel after backend route wiring is in place
- validate env vars:
  - `VITE_API_BASE_URL`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- validate backend runtime env:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` or equivalent service path
- validate end-to-end happy path using one seeded company example

## Recommended execution order from here
1. wire backend routes into server
2. apply migrations in Supabase
3. validate snapshot route against Supabase views
4. connect frontend ranking/pipeline views to persisted data
5. redeploy and validate Vercel
6. run MVP checkpoint test

## MVP checkpoint test
Run the following final test before calling the MVP functional:
- seed or bootstrap one company into ranking/thesis/pipeline
- confirm dashboard shows it
- confirm company detail shows persisted thesis + score history
- confirm ranking view shows it from persisted source
- confirm pipeline view shows official stage and next action
- confirm follow-up activity/task exists
