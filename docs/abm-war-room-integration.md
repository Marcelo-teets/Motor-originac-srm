# ABM War Room Integration

## Objetivo
Adicionar uma camada comercial operacional nativa ao Motor, conectando execução de conta (stakeholders/touchpoints/objeções) com qualification, ranking, thesis e sinais de intelligence.

## Arquitetura
- **Persistência**: Supabase (tabelas novas + colunas em `companies`).
- **Backend**: router `abmWarRoomRouter` com serviços dedicados para stakeholder, touchpoint, objection intelligence, momentum, priority e pre-call briefing.
- **Frontend**: Companies, Company Detail, Pipeline e Dashboard passam a consumir endpoints ABM para visão war-room semanal e por conta.

## Novas tabelas
- `account_stakeholders`
- `touchpoints`
- `objection_playbook`
- `objection_instances`
- `account_momentum_snapshots`
- `commercial_priority_snapshots`
- `deal_outcomes`

E extensão de `companies` com metadados comerciais (tier, owner, next step, momentum, pains, competitors etc).

## Regras de score
- **Commercial momentum**: recência de touchpoint, próximo passo vencido, champion/blocker, objeções abertas, delta de lead score, força de sinais.
- **Commercial priority**: lead/ranking/trigger, ticket estimado, champion, stale touchpoint, overdue next step e objeções críticas.

## Endpoints
- `GET|POST /abm/companies/:companyId/stakeholders`
- `GET|POST /abm/companies/:companyId/touchpoints`
- `GET|POST /abm/companies/:companyId/objections`
- `GET /abm/war-room/weekly`
- `GET /abm/companies/:companyId/pre-call-briefing`
- `GET /abm/companies/:companyId/pre-mortem`
- `POST /abm/companies/:companyId/recalculate-commercial-layer`

## Integração com camadas existentes
- Reuso de `company_signals`, `qualification_snapshots`, `thesis_outputs`, `lead_score_snapshots` e entidades core de `companies`.
- ABM não substitui pipeline/activities: adiciona visão de execução externa (`touchpoints`) e inteligência comercial explicável.

## Próximos passos
1. Ligar snapshots ABM ao motor de ranking para priorização automática cross-módulo.
2. Adicionar RLS/policies dedicadas para squads comerciais.
3. Evoluir pre-call briefing para síntese por persona (CFO/Tesouraria/Crédito).
