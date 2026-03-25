# Roadmap de Tecnologia e Produto — MVP do Motor de Originação

## Objetivo
Chegar a um MVP funcional que permita:
- login
- visão executiva no dashboard
- catálogo de fontes e conectores
- bootstrap de dados
- inteligência por empresa
- decision memo por empresa
- qualification bridge
- pipeline inicial
- quick actions operacionais

## Princípios de execução
1. executar em cima da stack oficial
2. evitar arquitetura paralela
3. priorizar fluxo ponta a ponta utilizável
4. usar mocks apenas como fallback controlado
5. commitar em blocos pequenos e validáveis

## Etapa 1 — Fundação de dados
### Meta
Deixar o Supabase pronto para ingestão, enrichment e memória.
### Entregas
- connector_registry
- source_endpoints
- ingestion_runs
- raw_documents
- company_source_facts
- signal_extractions
- enrichment_snapshots
- company_aliases
- agent_memory / feedback / improvement backlog
### Status
Concluída

## Etapa 2 — Camada de serviços backend
### Meta
Transformar fontes em inteligência persistida.
### Entregas
- sourceCatalog
- signalRules
- contentParsingService
- dataIntelligenceService
- entityResolutionService
- connectorCacheService
- connectorRunnerService
- companyIntelligenceService
- companyDecisionMemoService
- qualificationIntelligenceBridgeService
- mvpReadinessService
### Status
Em grande parte concluída

## Etapa 3 — Routers e server principal
### Meta
Expor a nova camada no backend principal.
### Entregas
- data-intelligence router
- agent-learning router
- company-intelligence router
- company-decision-memo router
- qualification-intelligence-bridge router
- mvp orchestration router
- mvp readiness router
- mvp quick actions router
- seed do catálogo no bootstrap
### Status
Parcialmente concluída

## Etapa 4 — Frontend MVP
### Meta
Refletir a nova camada no produto.
### Entregas
- DataIntelligencePage
- integração em nav e App
- types do frontend ampliados
- api client ampliado
- CompanyDetail enriquecido
- dashboard com prontidão e quick actions
### Status
Parcial

## Etapa 5 — Operação diária
### Meta
Permitir uso do MVP como ferramenta real de trabalho.
### Entregas
- quick actions
- readiness
- checklist operacional
- pipeline inicial
- activities/tasks como camada operacional mínima
### Status
Parcial

## Passo a passo executável
### Bloco A — Backend já executado
1. validar migrations no repo
2. validar services no backend
3. validar routers no backend
4. validar integração no server principal

### Bloco B — Frontend em execução agora
1. ampliar types
2. ampliar api client
3. integrar dashboard operacional
4. enriquecer company detail
5. ligar quick actions e readiness

### Bloco C — Operação mínima do MVP
1. subir branch válida na Vercel
2. usar dashboard como cockpit
3. usar data intelligence como console de dados
4. usar company detail como memo executivo
5. usar quick actions para rotina diária

## Critério objetivo de “MVP funcional”
- branch sobe saudável
- usuário autentica
- dashboard abre
- página Data Intelligence abre
- company detail abre com memo executivo
- readiness e quick actions aparecem
- backend responde rotas novas
- fluxo de dados consegue ser bootstrapado

## Próximos blocos de endurecimento depois do MVP funcional
- persistência real de pipeline / activities / tasks
- mais runs reais por empresa e fonte
- mais componentes do dashboard consumindo readiness/quick actions
- reduzir todos os pontos still-partial
