# Canonical DDL alignment notes

## Objetivo
Registrar o alinhamento entre o runtime atual do MVP e a camada de banco que precisa existir no ambiente para evitar quebra em implantação limpa ou parcialmente migrada.

## Pontos operacionais já usados pelo runtime
- `pipeline.owner`
- `pipeline.next_action`
- `activities.owner`
- `activities.description`
- `activities.type`
- `activities.due_date`
- `activities.updated_at`
- `tasks.owner`
- `tasks.description`
- `tasks.due_date`
- `watchlists`
- `watchlist_items`

## Como aplicar no ambiente
Ordem sugerida no Supabase SQL Editor:
1. `013_watchlist_mvp.sql`
2. `014_rls_runtime_core.sql`
3. `015_origination_command_center_views.sql`
4. `016_public_users_auth_sync.sql`
5. `017_runtime_operational_consolidation.sql`

## Observação
A migration 017 funciona como patch consolidado e idempotente para ambientes onde o runtime do MVP já evoluiu mais rápido do que o baseline do banco.

## Próximo passo de DDL canônico
Depois da ativação do ambiente, o passo seguinte é refletir o mesmo alinhamento diretamente em:
- `db/schema.sql`
- `db/migrations/001_canonical_init.sql`

Isso reduz o risco de novos ambientes nascerem defasados em relação ao runtime do backend.
