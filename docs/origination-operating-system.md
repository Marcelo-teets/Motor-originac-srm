# SRM Originação — Operating System

Este documento consolida a implementação das pendências do arquivo `SRM_Origination_Skills_Fluxos_Tarefas.md` dentro do repositório `Motor-originac-srm`.

## 1. O que foi implementado

A implementação transforma o documento operacional em uma camada versionada e consultável por API.

### Camadas entregues

1. **Módulo de código**
   - Arquivo: `backend/src/modules/originationOperatingSystem.ts`
   - Função: centraliza produtos, estruturas SRM, skills, fluxos, scorecard, templates, comandos, rotinas, backlog e plano de execução.

2. **Rotas Express preparadas**
   - Arquivo: `backend/src/routes/originationRouter.ts`
   - Função: expõe o Operating System em rotas internas reaproveitáveis.

3. **Rotas serverless de produção**
   - Arquivo raiz: `api/index.ts`
   - Arquivo backend-root: `backend/frontend/api/index.ts`
   - Função: garante que o framework esteja disponível em Vercel nos dois formatos de deploy usados no projeto.

4. **Migration Supabase**
   - Arquivo: `db/migrations/020_origination_operating_system.sql`
   - Função: cria a tabela `origination_os_artifacts` para persistir artefatos do framework.

5. **Documentação operacional**
   - Arquivo: `docs/origination-operating-system.md`
   - Função: orientar uso, endpoints e próximos passos.

---

## 2. Endpoints disponíveis

Após o deploy, consultar via `/api/origination/*`.

| Endpoint | Função |
|---|---|
| `/api/origination/os` | Retorna o Operating System completo |
| `/api/origination/skills` | Retorna a árvore de skills |
| `/api/origination/flows` | Retorna os fluxos operacionais |
| `/api/origination/backlog` | Retorna o backlog ORIG-001 a ORIG-020 |
| `/api/origination/templates` | Retorna templates de lead, tese, LinkedIn, e-mail, one-pager e relatório |
| `/api/origination/checklist` | Retorna checklist de execução por lead |
| `/api/origination/execution-plan` | Retorna plano de execução prático |

---

## 3. Backlog implementado

| Código | Item | Status |
|---|---|---|
| ORIG-001 | Company Master | Implementado / runtime existente |
| ORIG-002 | Template de lead enriquecido | Implementado |
| ORIG-003 | Scorecard DCM 0-100 | Implementado |
| ORIG-004 | Fluxo padrão de LinkedIn | Implementado |
| ORIG-005 | Pipeline comercial SRM | Runtime-ready |
| ORIG-006 | Ranking semanal | Runtime-ready |
| ORIG-007 | Template de tese | Implementado |
| ORIG-008 | Base de fontes públicas | Runtime-ready |
| ORIG-009 | Dashboard de originação | Runtime-ready |
| ORIG-010 | Módulo de triggers | Runtime-ready |
| ORIG-011 | One-pager automático | Implementado como template |
| ORIG-012 | Sequência de e-mails | Implementado como template |
| ORIG-013 | Biblioteca de hooks por produto | Implementado |
| ORIG-014 | Rotina de reciclagem de leads | Implementado |
| ORIG-015 | Monitoramento VC/PE | Documentado e plugável no Source Catalog |
| ORIG-016 | Relatório mensal setorial | Implementado como template |
| ORIG-017 | Copiloto comercial contextual | Runtime-ready via AI Router |
| ORIG-018 | Integração com bases externas | Runtime-ready via Source Catalog/connectors |
| ORIG-019 | Histórico de evolução de score | Runtime-ready via score snapshots |
| ORIG-020 | Comparáveis | Runtime-ready via market map |

---

## 4. Como usar no dia a dia

### Passo 1 — Consultar a base operacional

Acesse:

```text
/api/origination/os
```

Esse endpoint devolve tudo que compõe o modelo operacional: produtos, skills, fluxos, scorecard, templates, backlog e comandos padrão.

### Passo 2 — Rodar o ranking

Acesse:

```text
/api/rankings/v2
```

Use os primeiros nomes como lista de prioridade comercial.

### Passo 3 — Executar fluxo completo em uma empresa

Use o comando padrão:

```text
Execute nosso fluxo completo para a empresa [NOME/LINK].
Entregue resumo, modelo de negócio, sinais de funding, produto SRM sugerido, score, tese, abordagem e próxima ação.
```

### Passo 4 — Registrar ação comercial

Após definir a próxima ação, usar os endpoints existentes:

```text
POST /api/tasks
POST /api/activities
PATCH /api/pipeline/company/:id/next-action
POST /api/pipeline/company/:id/move
```

---

## 5. Produtos cobertos

O Operating System está limitado aos produtos definidos para o projeto:

1. FIDC.
2. CRI.
3. CRA.
4. Debênture.
5. Debênture Incentivada.

---

## 6. Estruturas SRM cobertas

1. SRM Ventures.
2. SRM Empírica.
3. SRM Asset.
4. DCM SRM.

---

## 7. Próximos passos recomendados

1. **Conectar o frontend** aos endpoints `/api/origination/*`.
2. **Rodar a migration** `020_origination_operating_system.sql` no Supabase.
3. **Criar painel visual** de skills, backlog e templates dentro do Command Center.
4. **Criar conector VC/PE dedicado** para monitorar portfólios.
5. **Automatizar relatório mensal** usando ranking, triggers, pipeline e score history.

---

## 8. Validação manual rápida

Após deploy, validar:

```text
GET /api/origination/os
GET /api/origination/backlog
GET /api/origination/templates
GET /api/origination/execution-plan
```

Resposta esperada:

```json
{
  "status": "real",
  "generatedAt": "...",
  "data": {}
}
```

---

## 9. Regra de governança

O arquivo `backend/src/modules/originationOperatingSystem.ts` passa a ser a fonte versionada de verdade para skills, fluxos, backlog e templates do projeto de originação.

Qualquer mudança de tese, produto, scorecard, skill, template ou rotina deve ser feita primeiro nesse módulo e depois refletida no frontend, banco e documentação.
