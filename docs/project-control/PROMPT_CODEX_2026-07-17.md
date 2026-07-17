# Prompt de execução para Codex

Você é o engenheiro responsável por transformar a **Origination Intelligence Platform** em um MVP real de originação.

## Fonte de verdade

Antes de alterar código, leia:

- `origination_project_brain_master.txt`, quando disponível;
- `docs/MOTOR_ORIGINACAO_DOCUMENTACAO_COMPLETA_20260715.md`, após o merge da PR #162;
- `docs/project-control/STATUS_E_ROADMAP_2026-07-17.md`;
- `docs/project-control/EXECUTION_PLAN_2026-07-17.md`.

## Stack obrigatória

- Frontend: React + Vite
- Backend: Node + TypeScript
- Banco/Auth: Supabase `hdghpmssudrqhsbvrdyt`
- Deploy: Vercel
- GitHub: fonte oficial

Proibido:
- Snowflake;
- stack paralela;
- refactor arquitetural amplo;
- secrets em código/log;
- claims `real` sem persistência e smoke;
- PRs empilhadas ou multifrente.

## Forma de trabalho

1. Atualize a `main`.
2. Crie uma branch exclusiva.
3. Faça uma única mudança coerente.
4. Inclua testes.
5. Inclua migration idempotente quando houver DDL.
6. Revise RLS e grants.
7. Rode typecheck, testes e build.
8. Abra PR com problema, solução, arquivos, migration, testes, smoke, rollback e riscos.
9. Nunca faça merge automático enquanto houver gate vermelho.

## Ordem de implementação

### PR 1 — Security Advisor

Branch: `fix/supabase-security-advisors`

Implementar:

- corrigir a view `capital_market_ingestion_health` para não operar com privilégios indevidos;
- revogar `EXECUTE` de `anon` nas funções:
  - `sync_capital_market_discovered_candidates(text)`;
  - `trigger_sync_capital_market_discovered_candidates()`;
- revogar de `authenticated` se a chamada não for necessária ao frontend;
- conceder apenas aos papéis administrativos requeridos;
- criar policies de `ranking_v2` coerentes com o modelo de auth;
- testes SQL de privilégios;
- documentação;
- rollback.

Aceite:
- Security Advisor sem ERROR;
- funções administrativas inacessíveis por anon;
- API/backend autorizado continua funcionando.

### PR 2 — Governança de deployment

Branch: `fix/production-deploy-governance`

Implementar:

- incluir em `/api/health`:
  - `gitSha`;
  - `environment`;
  - `deploymentId`;
- smoke que compare SHA esperado;
- falhar workflow quando domínio canônico servir SHA diferente da `main`;
- documentação de promoção.

Aceite:
- canonical = `main`;
- preview nunca é aceito como production;
- health não expõe segredo.

### PR 3 — Search Profile real

Branch: `feat/search-profile-scheduler`

Implementar:

- scheduler de profiles ativos;
- persistência de runs;
- ingestão de candidatos;
- dedupe;
- promoção governada;
- métricas e health;
- UI mínima.

Aceite:
- execução cria `search_profile_runs`;
- candidatos aparecem no Capture Inbox;
- promoção gera empresa e lineage;
- retry não duplica.

### PR 4 — Trigger Engine

Branch: `feat/trigger-engine-real`

Implementar triggers materiais com tipo, força, confiança, data, fonte, company, evidence payload, dedupe e ligação com recalculation.

Aceite:
- `trigger_events > 0`;
- trigger material recalcula qualification/ranking;
- trigger fraco não domina o score.

### PR 5 — Thesis e Market Map

Branches separadas:
- `feat/thesis-coverage`
- `feat/market-map-cards`

Aceite:
- top leads com thesis atual;
- estrutura sugerida baseada em evidência;
- market map não vazio;
- FIDC/DCM/outro explicado;
- risco e próxima ação presentes.

### PR 6 — Paper Clip executor real

Branch: `feat/paper-clip-executor`

Problema atual: `AbaService.runCommand()` marca qualquer comando como concluído em memória e não executa trabalho real.

Implementar:

- persistência de commands/runs;
- estados queued/running/completed/failed;
- allowlist de ações;
- worker/executor dentro da stack atual;
- criação de tasks e activities;
- idempotency key;
- retries;
- timeout;
- actor/auth;
- logs auditáveis;
- API de consulta;
- UI refletindo status real;
- downgrade para `partial` até o smoke passar.

Primeiras ações suportadas:
1. criar playbook do top lead;
2. criar tarefa de follow-up;
3. higienizar next actions ausentes;
4. gerar briefing pré-call;
5. registrar melhoria operacional.

Aceite:
- comando persiste;
- execução produz saída;
- falha é visível;
- retry não duplica task;
- execução anônima é recusada;
- `ai_agent_runs` ou tabela canônica equivalente recebe registros;
- status `real` somente após end-to-end verde.

## Guardrails de dados

- `source_catalog.id` é UUID no banco vivo.
- `metadata.code` é a chave lógica de fonte.
- Evite duplicar `metadata.code`.
- Dados observados, inferidos e recomendados devem permanecer distinguíveis.
- Toda tese aponta para evidência.
- Toda migration deve tolerar reexecução.
- Não apagar histórico para corrigir drift.

## Resultado esperado

Ao final das PRs:

- descoberta diária real;
- candidatos governados;
- top leads com tese;
- triggers e market map;
- pipeline acionável;
- Paper Clip executando trabalho persistido;
- produção segura e derivada da `main`.
