# MVP execution apply order

This runbook defines the practical order to move the repository closer to a functional MVP without reopening architecture.

## 1. Database first
Apply the migrations in this order:

1. `db/migrations/003_pipeline_crm_core.sql`
2. `db/migrations/004_ranking_thesis_score_history.sql`

Expected result:
- official pipeline stages
- CRM persistence for pipeline, activities and tasks
- persistence for ranking, thesis and score history

## 2. Backend wiring
Wire the backend in this order:

1. pipeline repository methods
2. pipeline routes
3. ranking/thesis/score history persistence service
4. platform status update

Reference artifacts already prepared in the execution flow:
- `backend_pipeline_service_patch.ts`
- `backend_server_patch.ts`
- `backend/src/services/persistence/rankingThesisPersistenceService.ts`

## 3. Frontend unblock
Apply the hotfix for Vercel build:

- add `getMvpQuickActions` to `frontend/src/lib/api.ts`
- add `MvpQuickActionsSnapshot` to `frontend/src/lib/types.ts`

Reference artifact:
- `frontend_mvp_quick_actions_fix.patch`

## 4. Vercel validation
After frontend hotfix:

1. redeploy the affected branch
2. confirm that `MvpOpsPage.tsx` no longer fails on TypeScript
3. validate root directory `frontend/`
4. validate output directory `dist`
5. validate env vars:
   - `VITE_API_BASE_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 5. MVP checkpoint
The repository is at MVP checkpoint only when the following are true:

- dashboard renders from real backend data
- company detail renders from real backend data
- ranking is persisted
- thesis is persisted
- pipeline is persisted
- activities and tasks are persisted
- score history is persisted
- Vercel build is green for the active frontend branch
