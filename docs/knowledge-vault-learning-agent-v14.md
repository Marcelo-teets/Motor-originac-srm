# Knowledge Vault V14 — Knowledge Learning Agent

## Objetivo

Manter automaticamente os mind maps internos atualizados conforme novas buscas, capturas, outputs de monitoramento e sinais chegam à plataforma.

“Aprender” nesta versão significa atualizar a memória institucional, as notas, as evidências e as relações do grafo. O agente não altera os pesos do modelo e não recalcula decisões de crédito.

## Arquitetura

```text
Search / Capture / Connector
→ monitoring_outputs / company_signals
→ knowledge_learning_jobs
→ worker governado
→ Vercel AI Gateway
→ JSON estruturado
→ validação de evidence IDs
→ knowledge_nodes / versions / references / links
→ mind map vivo por empresa
```

A solução usa a stack oficial:

- React + Vite;
- Node + TypeScript;
- Supabase;
- Vercel;
- GitHub Actions.

Nenhum banco, grafo ou motor paralelo foi criado.

## Mind map por empresa

O agente mantém um nó raiz determinístico e até oito ramos:

- funding;
- recebíveis;
- estrutura de capital;
- timing;
- patterns;
- riscos;
- stakeholders;
- fit de estrutura.

Os nós possuem `managedBy=knowledge-learning-agent-v1`, `agentKey`, `learningRunId`, `inputHash`, confiança e `scoreMutation=false`.

## Governança

- todo fato precisa referenciar um `company_signal`, `monitoring_output` ou `qualification_snapshot` existente;
- evidence IDs não encontrados são removidos;
- afirmações sem evidência válida são rebaixadas para hipótese;
- fatos, inferências e lacunas aparecem em blocos separados;
- conflitos entre fontes viram risco ou pergunta de validação;
- cada mudança gera versão histórica do nó;
- nós e links registram o run que os produziu;
- falhas usam retry, lease e dead-letter;
- orçamento diário e tamanho do lote são limitados;
- o agente nunca altera qualification, patterns, score, ranking ou pipeline.

## Fila automática

Triggers adicionam jobs quando:

- um output de monitoramento real/parcial possui confiança normalizada mínima de 55%;
- um sinal possui confiança mínima de 50%;
- o conteúdo relevante de uma evidência muda;
- um usuário solicita atualização manual para uma empresa.

O fingerprint evita reprocessamento do mesmo estado. Quando uma fonte muda, o job é reaberto de forma idempotente.

## Worker

O endpoint reutiliza a função Vercel existente `api/agentetome.ts`, evitando aumentar o número de funções serverless:

```text
POST /api/knowledge-learning-agent
Authorization: Bearer <CRON_SECRET>
```

Payload opcional:

```json
{
  "batchSize": 2,
  "dailyLimit": 48,
  "workerId": "manual-operator"
}
```

O GitHub Actions executa o worker a cada hora, no minuto 17, e também permite `workflow_dispatch`.

## LLM

O runtime usa Vercel AI Gateway com saída estruturada por JSON Schema.

Variáveis:

```text
AI_GATEWAY_API_KEY
KNOWLEDGE_LEARNING_MODEL=openai/gpt-5.4
CRON_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Em ambientes Vercel, `VERCEL_OIDC_TOKEN` pode substituir `AI_GATEWAY_API_KEY` quando o AI Gateway estiver habilitado para OIDC.

Não existe fallback simulado. Sem credencial real, o job falha de forma explícita, volta à fila e preserva o erro para auditoria.

## Interface

A rota `/knowledge-learning` apresenta:

- jobs pendentes, processando, concluídos e falhos;
- dead letters;
- runs concluídos no dia;
- modelo utilizado;
- nós criados e atualizados;
- relações e referências aplicadas;
- solicitação manual de atualização por empresa.

## Banco

Novas tabelas:

- `knowledge_learning_jobs`;
- `knowledge_learning_runs`.

RPCs principais:

- `knowledge_enqueue_company_learning`;
- `knowledge_claim_learning_jobs`;
- `knowledge_learning_context`;
- `knowledge_start_learning_run`;
- `knowledge_agent_upsert_node`;
- `knowledge_agent_sync_links`;
- `knowledge_finish_learning_run`;
- `knowledge_fail_learning_run`;
- `knowledge_learning_status`.

## Smoke real

A instalação foi validada no Supabase real dentro de uma transação com rollback:

- job manual;
- claim com lease;
- snapshot company-scoped;
- run de aprendizado;
- dois nós versionados;
- uma relação aplicada;
- finalização do job;
- rollback sem resíduos.

## Resultado operacional

O Vault passa a formar memória institucional continuamente:

```text
captura → evidência → interpretação governada → mapa vivo → validação humana → execução → outcome
```

O aprendizado posterior pode usar os outcomes para melhorar prompts, cobertura e perguntas de validação, mas qualquer alteração nos motores decisórios continuará exigindo implementação explícita e governada.
