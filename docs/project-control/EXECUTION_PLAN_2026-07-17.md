# Plano de Execução — Origination Intelligence Platform

**Data:** 17/07/2026  
**Princípio:** uma PR limpa por objetivo, sempre criada a partir da `main` atualizada.

## Ordem obrigatória

### Etapa 0 — Congelar expansão

Até concluir P0:
- não adicionar novas fontes;
- não criar novas abstrações;
- não alterar arquitetura;
- não promover preview para domínio canônico;
- não chamar integração parcial de `real`.

### Etapa 1 — Reconciliar a PR #161

Owner principal: Codex  
Owner operacional: Warp

1. Atualizar checkout local.
2. Confirmar head da `main`.
3. Revisar #161 contra schema vivo.
4. Rodar typecheck, testes backend, migration validation e smoke local.
5. Confirmar que a migration já aplicada no Supabase é idempotente.
6. Mergear por squash.
7. Atualizar checkout para nova `main`.
8. Validar produção apenas depois de deployment de `main`.

### Etapa 2 — Security hardening

PR exclusiva: `fix/supabase-security-advisors`

Escopo:
- corrigir `capital_market_ingestion_health`;
- revogar execute de funções administrativas para `anon`;
- revogar execute para `authenticated` quando não necessário;
- liberar somente `service_role`/backend administrativo;
- criar policy adequada para `ranking_v2`;
- adicionar testes de privilégio;
- documentar leaked password protection como dependência de plano.

Não misturar UI, conectores ou refactor.

### Etapa 3 — Deployment governance

PR exclusiva: `fix/production-deploy-governance`

Escopo:
- `/api/health` deve incluir `gitSha`, `environment` e `deploymentId` sem segredo;
- smoke deve comparar SHA esperado;
- documentar que alias canônico só aponta para deployment de `main`;
- validar root e health;
- remover associação de preview ao domínio canônico, se existente.

### Etapa 4 — CVM current canary

1. Rodar ingestão persistente fora do limite serverless.
2. Rodar segunda execução.
3. Exigir:
   - primeira execução com insert/update/unchanged coerentes;
   - segunda execução idempotente;
   - sem concorrência duplicada;
   - candidato CVM criado quando elegível;
   - promoção funcionando;
   - lineage preservado.
4. Atualizar/fechar issues antigas de smoke.

### Etapa 5 — Rebase e merge da #162

1. Rebasear na nova `main`.
2. Confirmar que 048–050 são as próximas migrations.
3. Validar ausência de duplicidade em `metadata.code`.
4. Rodar captura com cada fonte:
   - company website;
   - professional network;
   - CVM FIDC;
   - BCB SGS;
   - PNCP;
   - Querido Diário.
5. Confirmar que erro/resultado vazio não vira sinal comercial.
6. Aplicar migrations.
7. Mergear por squash.
8. Produzir deployment de `main`.

### Etapa 6 — Search Profile real

PR exclusiva: `feat/search-profile-scheduler`

Implementar:
- scheduler;
- `search_profile_runs`;
- adapters de descoberta;
- dedupe;
- Capture Inbox;
- promoção;
- métricas;
- UI mínima.

### Etapa 7 — Trigger, Thesis e Market Map

Dividir em três PRs pequenas:

1. `feat/trigger-engine-real`
2. `feat/thesis-coverage`
3. `feat/market-map-cards`

Cada output deve apontar para evidência e snapshot de origem.

### Etapa 8 — Paper Clip real

PR exclusiva: `feat/paper-clip-executor`

Contrato mínimo:
- persistir command;
- executar ação suportada;
- produzir task/activity;
- registrar actor, timestamps e resultado;
- suportar retry/idempotency;
- não permitir execução anônima;
- status real somente após smoke.

### Etapa 9 — Operação comercial

1. Higienizar pipeline.
2. Gerar owners e next actions.
3. Criar alertas de atraso.
4. Dashboard de prioridades.
5. War room semanal.

## Matriz de responsabilidade

| Frente | Warp | Codex |
|---|---|---|
| Checkout, rebase, scripts e validações | Responsável | Apoia |
| Migrations e implementação | Executa comandos | Responsável pelo código |
| Secrets e ambientes | Responsável operacional | Nunca expõe valores |
| Vercel alias/deploy | Responsável operacional | Implementa health/smokes |
| Supabase advisors | Executa e registra | Corrige via migration |
| PRs | Valida evidência | Cria PR limpa |
| Merge | Executa após gates | Recomenda somente após gates |
| Paper Clip | Valida runtime | Implementa executor |
| Roadmap/status | Atualiza evidência | Atualiza docs junto ao código |

## Gates obrigatórios de toda PR

- branch criada da `main` atual;
- escopo único;
- sem secret;
- typecheck verde;
- testes verdes;
- build verde;
- migration idempotente;
- RLS/privilégios revisados;
- preview não recebe domínio canônico;
- smoke real;
- documentação atualizada;
- rollback descrito.

## Painel semanal

Atualizar toda sexta-feira:

- SHA da `main`;
- SHA em produção;
- PRs abertas;
- migrations repo x banco;
- advisors;
- conectores por status;
- freshness;
- candidatos;
- leads promovidos;
- leads com thesis;
- leads com next action;
- comandos Paper Clip concluídos/falhos;
- blockers P0.
