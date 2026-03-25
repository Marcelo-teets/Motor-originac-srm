# ABM War Room Integration

## Objetivo
Adicionar ao Motor a camada operacional/comercial inspirada no ABM War Room sem replicar a estrutura do Notion e sem criar CRM paralelo.

## Princípio
O war room deve consumir a inteligência já existente do produto:
- companies
- qualification
- patterns
- ranking
- thesis
- company intelligence
- pipeline
- activities/tasks

## Novos blocos funcionais
1. Stakeholder map por conta
2. Touchpoint timeline
3. Objection intelligence
4. Commercial momentum
5. Commercial priority
6. Pre-call briefing
7. Pre-mortem do deal
8. Win/loss learning

## Tabelas novas
- account_stakeholders
- touchpoints
- objection_playbook
- objection_instances
- account_momentum_snapshots
- commercial_priority_snapshots
- deal_outcomes

## Expansões em companies
- account_tier
- estimated_ticket_size
- commercial_owner_id
- commercial_owner_name
- next_step
- next_step_due_at
- last_touchpoint_at
- momentum_status
- priority_reason
- mapped_pains
- competitors_context
- entry_angle
- weekly_focus_flag

## Regras
### Commercial momentum
Considera:
- recência de touchpoint
- next step vencido
- champion/blocker
- objeções abertas
- evolução recente do deal

### Commercial priority
Considera:
- lead score
- ranking score
- trigger strength
- urgência
- ticket estimado
- cobertura comercial recente
- objeções críticas

## Endpoints propostos
- GET /abm/companies/:companyId/stakeholders
- POST /abm/companies/:companyId/stakeholders
- GET /abm/companies/:companyId/touchpoints
- POST /abm/companies/:companyId/touchpoints
- GET /abm/companies/:companyId/objections
- POST /abm/companies/:companyId/objections
- GET /abm/companies/:companyId/pre-call-briefing
- GET /abm/companies/:companyId/pre-mortem
- POST /abm/companies/:companyId/recalculate-commercial-layer
- GET /abm/war-room/weekly

## Integração com o frontend
Entradas mínimas:
- CompanyDetailPage: stakeholder map, touchpoint timeline, objection intelligence, briefing, pre-mortem
- CompaniesPage: priority, momentum, next step, last touchpoint
- PipelinePage: champion/blocker, próximas ações vencidas, deals esfriando
- Dashboard/MVP Ops: bloco ABM War Room

## Status esperado
Após esta integração, a camada comercial deixa de ser derivação leve e passa a ser persistida, explicável e conectada à inteligência do Motor.
