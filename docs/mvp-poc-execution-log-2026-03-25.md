# MVP POC execution log — 2026-03-25

## Objetivo
Executar o plano de fechamento do MVP funcional para POC do Motor de Originação, priorizando o caminho crítico institucional:

1. Supabase real no caminho crítico
2. ingestão mínima real
3. qualification / lead score / ranking / thesis consistentes
4. pipeline mínimo persistido
5. camada comercial mínima (ABM)
6. ambiente de demo estável

## O que foi validado no repositório
- Monorepo oficial já consolidado com `frontend/` e `backend/`.
- Auth com Supabase JWT e endpoints `/auth/*` já está implementado.
- Schema canônico já cobre `companies`, `search_profiles`, `monitoring_outputs`, `company_signals`, `qualification_snapshots`, `lead_score_snapshots`, `pipeline`, `activities`, `tasks`, AI layer e ABM War Room.
- ABM já foi incorporado ao `main` via PR #19.
- Produção `main` na Vercel estava `READY` no deployment `dpl_HTxfGZwku7j2KLZjbpPTu63ZDkdi`.
- Branch operacional `gpt/abm-war-room-foundation-v2` está quebrando build por erro de TypeScript em `src/pages/MvpOpsPage.tsx`: chamada a `api.getMvpQuickActions` inexistente.

## Gaps reais ainda abertos para a POC
### 1. Pipeline / activities ainda estão simplificados demais
Hoje o backend devolve pipeline de forma derivada em `/pipeline` e `/activities`, sem persistência operacional suficiente para POC.

### 2. Frontend ainda deriva parte do estado
`frontend/src/lib/api.ts` ainda monta `PipelineSnapshot` a partir de `/companies`, em vez de consumir um pipeline persistido.

### 3. Build quebrado em branch operacional
A branch `gpt/abm-war-room-foundation-v2` quebra em Vercel por referência ausente a `getMvpQuickActions`.

### 4. Caminho crítico ainda mistura real/parcial
Monitoring, agents e pipeline ainda aparecem como parciais na matriz de status.

## Delta de execução recomendado imediatamente
### PR-1 — Hardening do caminho crítico
Arquivos-alvo:
- `backend/src/server.ts`
- `backend/src/repositories/platformRepository.ts`
- `frontend/src/lib/api.ts`
- `docs/status-matrix.md`

Objetivo:
- falhar explicitamente nas rotas core quando Supabase não estiver operacional
- remover fallback silencioso para dashboard / companies / company detail / pipeline da POC

### PR-2 — Persistência mínima de pipeline e activities
Arquivos-alvo:
- `backend/src/types/platform.ts`
- `backend/src/repositories/platformRepository.ts`
- `backend/src/services/platformService.ts`
- `backend/src/server.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/pages/PipelinePage.tsx`
- `frontend/src/pages/CompanyDetailPage.tsx`

Objetivo:
- persistir leitura de `pipeline` e `activities`
- deixar dashboard e company detail lendo estágio e próxima ação reais

### PR-3 — Fechar monitoring -> qualification -> ranking -> thesis por empresa
Arquivos-alvo:
- `backend/src/services/platformService.ts`
- `backend/src/lib/connectors.ts`
- `backend/src/lib/qualification.ts`
- `backend/src/lib/patterns.ts`
- `frontend/src/pages/CompanyDetailPage.tsx`

Objetivo:
- recálculo por empresa consistente e demonstrável

### PR-4 — Corrigir branch quebrada da Vercel
Arquivo-alvo:
- `frontend/src/lib/api.ts` ou `src/pages/MvpOpsPage.tsx` da branch operacional

Objetivo:
- remover ou implementar `getMvpQuickActions`
- restaurar preview deploy funcional

## Bloqueio técnico encontrado nesta sessão
O conector GitHub disponível nesta sessão permite:
- ler arquivos
- criar branch
- criar arquivos novos
- abrir PR

Mas não expõe, nesta interface, o campo `sha` necessário para atualizar arquivos existentes via contents API, nem a `tree_sha` base de forma recuperável para um commit multi-arquivo seguro.

## Resultado desta execução
- branch criada: `gpt/mvp-poc-execution`
- diagnóstico técnico consolidado
- backlog executável por PR estruturado
- pronto para commit assim que o meio de escrita em arquivos existentes estiver liberado
