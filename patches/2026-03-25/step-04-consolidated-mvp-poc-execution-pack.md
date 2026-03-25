# Step 04 — Consolidated MVP POC execution pack

## Objetivo
Consolidar em um único documento a ordem de aplicação dos artefatos já criados na branch `gpt/mvp-poc-execution`, para fechar o MVP funcional de POC do Motor de Originação.

## Visão geral
Este pack consolida 4 blocos:
1. hotfix do cockpit operacional
2. pipeline e activities reais
3. compatibilidade de readiness/intelligence
4. release e validação de demo

---

## Artefatos já criados nesta branch
### 1. Log e backlog central
- `docs/mvp-poc-execution-log-2026-03-25.md`

### 2. Hotfix do cockpit operacional
- `patches/2026-03-25/step-01-hotfix-mvp-ops-api.diff`

### 3. Pipeline / activities hardening
- `patches/2026-03-25/step-02-pipeline-activities-hardening.md`

### 4. Release checklist da POC
- `docs/poc-release-checklist-2026-03-25.md`

### 5. Demo validation playbook
- `docs/poc-demo-validation-playbook-2026-03-25.md`

---

## Ordem de execução recomendada

### Fase A — Destravar build do cockpit
Aplicar primeiro:
- `patches/2026-03-25/step-01-hotfix-mvp-ops-api.diff`

Objetivo:
- implementar `getMvpQuickActions` no `frontend/src/lib/api.ts`
- tipar `getMvpReadiness` corretamente
- fazer `MvpOpsPage.tsx` compilar

Critério de aceite:
- build da branch operacional deixa de quebrar por `getMvpQuickActions`
- `MvpOpsPanel` recebe `readiness` e `quickActions`

---

### Fase B — Fechar pipeline / activities reais
Aplicar na sequência:
- `patches/2026-03-25/step-02-pipeline-activities-hardening.md`

Objetivo:
- criar leitura/escrita real de `pipeline` e `activities`
- parar de derivar pipeline no frontend a partir de `/companies`
- fazer `PipelinePage` e `CompanyDetailPage` refletirem estado operacional persistido

Arquivos impactados:
- `backend/src/types/platform.ts`
- `backend/src/repositories/platformRepository.ts`
- `backend/src/services/platformService.ts`
- `backend/src/server.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/PipelinePage.tsx`
- `frontend/src/pages/CompanyDetailPage.tsx`

Critério de aceite:
- `/pipeline` responde board persistido
- `/activities` responde atividades persistidas
- mover estágio atualiza a empresa
- criar atividade atualiza a empresa

---

### Fase C — Fechar compatibility layer do cockpit com o backend
Implementar depois da Fase B:

#### Métodos a adicionar em `PlatformService`
- `getCompanyIntelligenceSummary(id)`
- `getCompanyDecisionMemo(id)`
- `getQualificationIntelligenceBridge(id)`
- `getMvpReadiness()`

#### Rotas a adicionar em `backend/src/server.ts`
- `GET /mvp-readiness`
- `GET /company-intelligence/:id/summary`
- `GET /company-decision-memo/:id`
- `GET /qualification-intelligence-bridge/:id`

Base de reaproveitamento já existente:
- `getCompanyDetail(id)`
- `getDashboard()`
- `getCompanyRanking(id)`
- `recalculateCompany(id)`

Objetivo:
- alinhar o backend com o frontend operacional já existente
- permitir que cockpit, company intelligence, decision memo e qualification bridge funcionem sem rotas mockadas quebradas

Critério de aceite:
- `/mvp-readiness` responde
- `/company-intelligence/:id/summary` responde
- `/company-decision-memo/:id` responde
- `/qualification-intelligence-bridge/:id` responde
- `MvpOpsPage` carrega sem 404

---

### Fase D — Release e validação
Usar os documentos:
- `docs/poc-release-checklist-2026-03-25.md`
- `docs/poc-demo-validation-playbook-2026-03-25.md`

Objetivo:
- fechar variáveis de ambiente
- validar dados seedados
- validar demo ponta a ponta
- transformar o Motor em ambiente apresentável de POC

Critério de aceite final:
1. logar
2. abrir dashboard
3. abrir empresa prioritária
4. recalcular empresa
5. ver score/ranking/tese atualizados
6. registrar touchpoint
7. mover pipeline
8. sair com próxima ação objetiva

---

## Sequência ideal de PRs
### PR-A
- hotfix de `getMvpQuickActions`
- build verde da branch operacional

### PR-B
- persistência de `pipeline` e `activities`
- frontend lendo backend real

### PR-C
- rotas de readiness / intelligence / memo / bridge
- cockpit operacional compatível com backend

### PR-D
- revisão final de release
- checklist completo
- validação de demo

---

## Recomendação executiva
Não abrir novas frentes antes de concluir as quatro fases acima.

O menor caminho para a POC é:
- corrigir build
- persistir pipeline
- compatibilizar cockpit
- validar release

Qualquer trabalho fora disso aumenta superfície, mas não melhora a capacidade imediata de demonstrar o produto.
