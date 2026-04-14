# MVP 1.0 — revisão pós-merge

## O que foi concluído no código
- PR #44 merged com Watch List
- `docs/mvp-v1-execution-plan.md` publicado
- `docs/mvp-v1-activation-checklist.md` publicado
- `db/migrations/015_origination_command_center_views.sql` publicada
- `db/migrations/016_auth_user_mirror.sql` publicada
- helper `backend/src/lib/userSync.ts` adicionado para apoiar sincronização de usuários no runtime

## O que a migration 015 resolve
- alinha o schema operacional com o runtime atual de `pipeline`, `activities` e `tasks`
- cria views operacionais para leitura consolidada do MVP
- principal view: `origination_company_command_center_v1`

## O que a migration 016 resolve
- espelha `auth.users` em `public.users`
- reduz risco de `created_by` e `added_by` nulos nas tabelas operacionais
- melhora aderência entre Auth real e ownership/auditoria no app

## Ordem recomendada de aplicação no banco
1. `001_canonical_init.sql` e seeds base do projeto
2. `013_watchlist_mvp.sql`
3. `014_rls_runtime_core.sql`
4. `015_origination_command_center_views.sql`
5. `016_auth_user_mirror.sql`

## O que ainda falta para declarar o MVP pronto
### Bloqueadores de aceite
1. aplicar no Supabase as migrations 013, 014, 015 e 016
2. validar envs reais do backend
3. validar envs reais da Vercel
4. executar smoke test ponta a ponta

### Endurecimento pós-aceite
1. alinhar `db/schema.sql` e `db/migrations/001_canonical_init.sql` ao runtime final
2. atualizar `docs/database.md` e `docs/status-matrix.md` para refletir o estado atual
3. automatizar o smoke test / readiness checks

## Critério prático de aceite
O MVP 1.0 pode ser considerado pronto quando o fluxo abaixo estiver verde com banco real:
- login
- dashboard
- leads
- company detail
- salvar empresa em watch list
- abrir watch list
- mover para pipeline
- criar activity
- criar task
- rodar monitoring manual
- validar sinal, score e feed
