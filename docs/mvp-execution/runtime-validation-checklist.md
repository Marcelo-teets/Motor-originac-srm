# Runtime Validation Checklist for Functional MVP

Use this checklist after wiring the backend routes and applying migrations.

## 1. Supabase
- [ ] apply `db/migrations/003_pipeline_crm_core.sql`
- [ ] apply `db/migrations/004_ranking_thesis_score_history.sql`
- [ ] run `db/verification/verify_mvp_persistence.sql`
- [ ] confirm `vw_pipeline_current` returns rows or an empty but valid result
- [ ] confirm `vw_latest_ranking_v2` returns rows or an empty but valid result
- [ ] confirm `vw_latest_thesis_outputs` returns rows or an empty but valid result

## 2. Backend route registration
- [ ] apply `backend/patches/server.registerMvpRoutes.patch`
- [ ] restart backend
- [ ] confirm route `POST /mvp/persistence-bootstrap`
- [ ] confirm route `GET /mvp/intelligence-snapshot`

## 3. Persistence bootstrap
- [ ] run with `backend/examples/mvpPersistenceBootstrap.curl.sh`
  or
- [ ] run with `backend/examples/mvpPersistenceBootstrap.payload.json`
- [ ] confirm response contains non-zero persisted rows where expected

## 4. Snapshot validation
- [ ] call `GET /mvp/intelligence-snapshot`
- [ ] confirm `ranking` payload is returned
- [ ] confirm `thesis` payload is returned
- [ ] confirm `pipeline` payload is returned

## 5. Frontend
- [ ] confirm hotfix from PR #26 is present in active branch/main
- [ ] build frontend successfully
- [ ] validate Dashboard loads
- [ ] validate Company Detail loads
- [ ] validate Leads / Ranking loads persisted data
- [ ] validate Pipeline loads persisted data or official snapshot

## 6. Vercel
- [ ] validate `VITE_API_BASE_URL`
- [ ] validate `VITE_SUPABASE_URL`
- [ ] validate `VITE_SUPABASE_ANON_KEY`
- [ ] redeploy active branch
- [ ] confirm green build

## 7. MVP checkpoint
- [ ] one company appears in ranking
- [ ] one thesis is queryable
- [ ] one pipeline row exists in official stage
- [ ] one activity exists
- [ ] one task exists
- [ ] dashboard/company detail/ranking/pipeline all render without fallback breaking the flow
