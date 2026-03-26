# Codex handoff — MVP POC execution

## Contexto
Você está trabalhando no repositório oficial do projeto **Motor-originac-srm**.

Este projeto é a base do **Origination Intelligence Platform**, com foco em fintechs, empresas com recebíveis, empresas com produto de crédito, middle market tech e empresas com potencial real de FIDC / DCM.

### Stack oficial
- Frontend: React + Vite
- Backend: Node + TypeScript
- Banco/Auth: Supabase
- Deploy frontend: Vercel
- GitHub é a fonte oficial

### Princípios obrigatórios
- não abrir arquitetura nova
- não criar stack paralela
- não sugerir ferramenta fora do stack oficial
- usar Supabase como fonte real do caminho crítico
- código > explicação
- foco total em entregar **MVP funcional para POC**

---

## Objetivo desta execução
Fechar o caminho crítico do MVP para POC.

O produto precisa responder, com dados reais ou parcialmente reais controlados:
1. quem são os melhores leads
2. o que mudou neles
3. por que isso importa financeiramente
4. qual estrutura faz sentido
5. por que agora
6. qual a próxima ação

---

## Estado atual já validado
### Já existe no repositório
- auth real com Supabase
- monorepo backend/frontend
- schema robusto com companies, search_profiles, monitoring_outputs, company_signals, qualification_snapshots, company_patterns, score snapshots, ranking, pipeline e camada ABM
- dashboard, companies e company detail estruturados
- ABM War Room já incorporado no main

### Gaps reais ainda abertos
1. branch operacional de cockpit quebra build por `getMvpQuickActions` ausente no frontend API client
2. pipeline e activities ainda estão simplificados demais
3. frontend ainda deriva parte do pipeline a partir de `/companies`
4. backend ainda não expõe:
   - `/mvp-readiness`
   - `/company-intelligence/:id/summary`
   - `/company-decision-memo/:id`
   - `/qualification-intelligence-bridge/:id`

---

## Artefatos já criados nesta branch de execução
Na branch `gpt/mvp-poc-execution` você encontrará:

1. `docs/mvp-poc-execution-log-2026-03-25.md`
2. `patches/2026-03-25/step-01-hotfix-mvp-ops-api.diff`
3. `patches/2026-03-25/step-02-pipeline-activities-hardening.md`
4. `docs/poc-release-checklist-2026-03-25.md`
5. `docs/poc-demo-validation-playbook-2026-03-25.md`
6. `patches/2026-03-25/step-04-consolidated-mvp-poc-execution-pack.md`

Use esses arquivos como trilho de execução. Não ignore o conteúdo deles.

---

## Tarefa principal
Aplicar no código-fonte as mudanças descritas nos artefatos acima e abrir PRs pequenos e objetivos para fechar o MVP da POC.

### Ordem obrigatória de execução

## PR-A — Hotfix do cockpit operacional
### Objetivo
Destravar a branch operacional que quebra build por ausência de `getMvpQuickActions`.

### Ações
- editar `frontend/src/lib/api.ts`
- implementar `getMvpQuickActions(session)`
- tipar `getMvpReadiness(session)` com `MvpReadinessSnapshot`
- garantir compatibilidade com `frontend/src/pages/MvpOpsPage.tsx`
- garantir compatibilidade com `frontend/src/components/MvpOpsPanel.tsx`

### Critério de aceite
- `MvpOpsPage` compila
- o erro de TypeScript some
- build preview deixa de quebrar por esse motivo

---

## PR-B — Pipeline / activities reais
### Objetivo
Parar de derivar pipeline no frontend e amarrar a operação em persistência real.

### Arquivos-alvo
- `backend/src/types/platform.ts`
- `backend/src/repositories/platformRepository.ts`
- `backend/src/services/platformService.ts`
- `backend/src/server.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/PipelinePage.tsx`
- `frontend/src/pages/CompanyDetailPage.tsx`

### Entregas mínimas
- criar tipos de `PipelineEntry` e `ActivityEntry`
- criar leitura/escrita de `pipeline` e `activities` no repository
- criar métodos no service para:
  - board de pipeline
  - listar activities
  - mover pipeline
  - criar activity
- trocar `getPipelineSnapshot()` no frontend para consumir `/pipeline`
- fazer Company Detail refletir estágio e activities reais

### Critério de aceite
- `/pipeline` responde estado persistido
- `/activities` responde estado persistido
- mover estágio altera estado da empresa
- criar activity altera Company Detail
- `PipelinePage` consome backend real

---

## PR-C — Readiness e intelligence compatibility layer
### Objetivo
Compatibilizar o backend atual com o cockpit operacional e com a superfície de intelligence já esperada pelo frontend.

### Arquivos-alvo
- `backend/src/types/platform.ts`
- `backend/src/services/platformService.ts`
- `backend/src/server.ts`

### Adicionar tipos
- `CompanyIntelligenceSummary`
- `CompanyDecisionMemo`
- `QualificationIntelligenceBridge`
- `MvpReadinessSnapshot`

### Adicionar métodos no PlatformService
- `getCompanyIntelligenceSummary(id)`
- `getCompanyDecisionMemo(id)`
- `getQualificationIntelligenceBridge(id)`
- `getMvpReadiness()`

### Regras
Esses métodos devem reaproveitar a base já existente em:
- `getCompanyDetail(id)`
- `getDashboard()`
- `getCompanyRanking(id)`
- `recalculateCompany(id)`

Não inventar serviço paralelo.

### Rotas a expor no server
- `GET /mvp-readiness`
- `GET /company-intelligence/:id/summary`
- `GET /company-decision-memo/:id`
- `GET /qualification-intelligence-bridge/:id`

### Critério de aceite
- essas 4 rotas respondem sem 404
- `MvpOpsPage` carrega readiness
- company intelligence / memo / bridge respondem com payload coerente

---

## PR-D — Fechamento de release da POC
### Objetivo
Garantir que a aplicação esteja demonstrável ponta a ponta.

### Basear-se em
- `docs/poc-release-checklist-2026-03-25.md`
- `docs/poc-demo-validation-playbook-2026-03-25.md`

### Validar
- login
- dashboard
- companies
- company detail
- recálculo da empresa
- ABM war room
- pipeline
- activities
- cockpit operacional

### Critério final de pronto
O fluxo abaixo deve funcionar:
1. logar
2. abrir dashboard
3. escolher top lead
4. abrir company detail
5. recalcular empresa
6. ver score/ranking/tese atualizados
7. registrar interação comercial
8. mover pipeline
9. sair com próxima ação objetiva

---

## Instruções de execução para o Codex
- trabalhe sempre em cima da branch mais atual
- mantenha PRs pequenos, objetivos e mergeáveis
- não pare em documentação: aplique código de verdade
- sempre que editar uma parte do projeto, revise os impactos cruzados
- se criar nova rota backend, atualize o client frontend correspondente
- se mexer em tipos compartilhados, ajuste todos os consumidores
- se houver build quebrado na Vercel, trate como prioridade alta

---

## Saída esperada
Ao final, o repositório deve ficar com:
- build funcional
- pipeline/activities operacionais
- cockpit operacional compatível com backend
- checklist de release atendido
- POC pronta para demonstração
