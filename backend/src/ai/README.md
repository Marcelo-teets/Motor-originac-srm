# AI Layer (Agent-Ready)

Esta pasta está preparada para plugar agentes sem refatorar o core.

## Contratos estáveis
- `types.ts` define interfaces para:
  - gateway de LLM (`LLMGateway`)
  - construção de contexto (`CompanyContextProvider`)
  - retrieval vetorial (`VectorRetriever`)
  - gravação de feedback (`AnalystFeedbackRecorder`)
  - plugins de agente (`AgentPlugin`)

## Pipeline
- `CopilotQueryEngine` executa:
  1. contexto + retrieval
  2. hooks de agentes (`AgentRegistry.runPreProcessors`)
  3. chamada ao LLM
  4. hooks de pós-processamento (`runPostProcessors`)
  5. persistência de sessão/mensagens

## Como plugar um agente
1. Implementar `AgentPlugin`.
2. Registrar no `AgentRegistry` (hoje em `aiRouter.ts`; futuramente via DI/config).
3. Usar `preProcess` para enriquecer prompt/contexto e `postProcess` para validação/normalização da resposta.
