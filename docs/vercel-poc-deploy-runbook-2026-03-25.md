# Vercel POC Deploy Runbook — 2026-03-25

## Objetivo
Publicar e validar o frontend da POC do Motor de Originação em ambiente demonstrável.

## Projeto alvo
Projeto Vercel já usado no contexto do Motor.

## Variáveis de ambiente mínimas
### Frontend
- `VITE_API_BASE_URL`

Deve apontar para o backend correto da POC.

### Backend (se também estiver publicado em ambiente controlado)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `USE_SUPABASE=true`
- demais variáveis necessárias do serviço

## Ordem recomendada
### 1. Garantir build verde no branch alvo
Antes de promover qualquer branch para demo:
- corrigir erro de `getMvpQuickActions`
- garantir que nenhuma tela crítica quebre em TypeScript

### 2. Confirmar alinhamento backend/frontend
O frontend da POC depende diretamente de:
- auth
- dashboard
- companies
- company detail
- ranking
- ABM endpoints
- pipeline / activities
- readiness / intelligence endpoints

### 3. Executar deploy preview
Subir primeiro o preview da branch de trabalho.

### 4. Validar o preview com o playbook da POC
Usar:
- `docs/poc-demo-validation-playbook-2026-03-25.md`
- `docs/poc-release-checklist-2026-03-25.md`

### 5. Promover para branch de release
Somente depois do preview passar nos fluxos críticos.

## Smoke tests no ambiente publicado
### Fluxo 1 — Login
- abrir app
- autenticar
- confirmar sessão ativa

### Fluxo 2 — Dashboard
- verificar cards de summary
- verificar top leads
- verificar widget ABM
- verificar widget monitoring

### Fluxo 3 — Company Detail
- abrir top lead
- validar qualification, patterns, thesis e score history
- validar touchpoints / objections / briefing
- executar recálculo

### Fluxo 4 — Pipeline
- abrir PipelinePage
- validar estágios
- validar atividades
- mover empresa de estágio
- criar activity

### Fluxo 5 — Cockpit operacional
- abrir MVP Ops
- validar readiness
- validar quick actions

## Troubleshooting direto
### Caso 1 — Build quebra por `getMvpQuickActions`
Ação:
- aplicar o hotfix do arquivo `patches/2026-03-25/step-01-hotfix-mvp-ops-api.diff`

### Caso 2 — Página carrega mas API responde 404
Ação:
- revisar `VITE_API_BASE_URL`
- confirmar que o backend expõe as rotas do bloco readiness/intelligence

### Caso 3 — Dashboard funciona, mas pipeline ainda parece mockado
Ação:
- aplicar o patch pack `patches/2026-03-25/step-02-pipeline-activities-hardening.md`
- validar `/pipeline` e `/activities`

### Caso 4 — Cockpit operacional abre sem dados
Ação:
- confirmar backend com:
  - `/mvp-readiness`
  - `/company-intelligence/:id/summary`
  - `/company-decision-memo/:id`
  - `/qualification-intelligence-bridge/:id`

### Caso 5 — Ambiente sobe, mas Company Detail não reflete mudanças
Ação:
- validar persistência de `pipeline`, `activities`, `touchpoints` e recálculo da empresa

## Critério final de deploy aprovado
Deploy aprovado quando o ambiente publicado permite:
1. logar
2. abrir dashboard
3. abrir top lead
4. recalcular empresa
5. registrar touchpoint
6. mover pipeline
7. sair com próxima ação clara

## Observação executiva
Não considerar deploy aprovado apenas porque a home abriu.
O deploy da POC só está aceito quando o fluxo operacional completo estiver funcionando.