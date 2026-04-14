# MVP 1.0 — revisão pós-merge e pendências

## Resumo
A base do MVP já está na `main`.
O projeto está em estado de ativação operacional.

O aceite depende principalmente de:
1. aplicar migrations no Supabase
2. validar envs reais
3. executar smoke test ponta a ponta

## Concluído na `main`
- PR #44 merged com Watch List
- plano do MVP em `docs/mvp-v1-execution-plan.md`
- checklist de ativação em `docs/mvp-v1-activation-checklist.md`
- migration `015_origination_command_center_views.sql`
- alinhamento operacional do runtime para `pipeline`, `activities` e `tasks` via migration 015

## Bloqueadores reais para declarar o MVP pronto

### 1. Aplicar migrations 013, 014 e 015 no Supabase
Ordem:
- `013_watchlist_mvp.sql`
- `014_rls_runtime_core.sql`
- `015_origination_command_center_views.sql`

### 2. Validar envs reais
Backend:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USE_SUPABASE=true`

Frontend:
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 3. Executar smoke test
Fluxo:
- login
- dashboard
- leads
- company detail
- salvar em watch list
- abrir watch list
- mover para pipeline
- criar activity
- criar task
- rodar monitoring manual
- validar sinal, score e feed

## Próximas PRs sugeridas

### PR-A
Alinhar `db/schema.sql` e `db/migrations/001_canonical_init.sql` ao runtime atual.

### PR-B
Resolver sincronização entre Supabase Auth e tabela `users` do app.

### PR-C
Transformar o checklist do MVP em validação mais auditável e repetível.

## Critério de aceite do MVP
- migrations aplicadas
- envs validadas
- login real funcionando
- Watch List operacional
- pipeline, activities e tasks persistindo
- monitoring manual gerando outputs
- smoke test aprovado
