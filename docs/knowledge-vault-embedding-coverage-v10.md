# Knowledge Vault V10 — Cobertura governada de embeddings

## Objetivo

Transformar o corpus parcialmente vetorizado do Knowledge Vault em uma base semântica operacional, progressiva e auditável, sem vetores mockados, sem mistura de modelos e sem consumo de API sem limite.

A V10 responde:

1. quais documentos ainda não possuem embedding real;
2. qual modelo e dimensão pertencem ao corpus oficial;
3. como distribuir trabalho com concorrência segura;
4. como repetir falhas sem duplicação ou perda de jobs;
5. quanto já foi processado no dia;
6. como impedir que conteúdo alterado preserve um vetor obsoleto;
7. como observar cobertura e falhas sem expor a fila operacional ao frontend.

## Contrato semântico oficial

```text
Provedor: Voyage AI
Modelo: voyage-3.5
Dimensão: 1024
Input type do corpus: document
Input type da consulta: query
Embedding sintético: proibido
```

A troca de modelo ou dimensão exige reindexação integral. Vetores de espaços diferentes não devem ser misturados.

## Estado inicial real

Projeto Supabase:

```text
hdghpmssudrqhsbvrdyt
```

Baseline observado em 24/07/2026:

```text
Documentos: 2.541
Com embedding real: 230
Pendentes: 2.311
Cobertura: 9,05%
```

Por fonte:

```text
company_signals: 2.538 documentos / 230 cobertos / 2.308 pendentes
thesis_outputs: 3 documentos / 0 cobertos / 3 pendentes
```

## Banco de dados

Migrations:

```text
db/migrations/098_knowledge_embedding_coverage_v10.sql
db/migrations/099_knowledge_embedding_budget_baseline_fix.sql
db/migrations/100_knowledge_embedding_vector_comparison_fix.sql
db/migrations/101_knowledge_embedding_security_hardening.sql
```

### `knowledge_embedding_jobs`

Fila oficial service-role-only com:

- um job por `vector_document_id`;
- status `pending`, `processing`, `completed` ou `dead`;
- modelo e dimensão contratados;
- SHA-256 do conteúdo;
- prioridade;
- tentativas e máximo de tentativas;
- próxima tentativa;
- lease por worker;
- erro mais recente;
- request ID do provedor;
- tokens reportados;
- timestamps operacionais.

### Concorrência

`knowledge_claim_embedding_jobs` usa:

- `FOR UPDATE SKIP LOCKED`;
- lease temporal;
- `locked_by` por worker;
- recuperação de leases expirados;
- limite de batch;
- limite diário de conclusões reais.

### Idempotência e conteúdo obsoleto

- `vector_document_id` é único na fila;
- o hash do conteúdo acompanha o job;
- conteúdo alterado invalida o embedding anterior;
- mudança durante processamento devolve o job para `pending`;
- jobs `dead` podem ser reabertos quando o conteúdo muda;
- o baseline histórico não consome o orçamento diário do novo worker.

### Retry

Falhas usam backoff exponencial limitado:

```text
60s → 120s → 240s → 480s → dead
```

O valor pode respeitar `Retry-After` do provedor, entre 30 segundos e 24 horas.

## Edge Function

Arquivo:

```text
supabase/functions/knowledge-embedding-worker/index.ts
```

Deploy:

```text
knowledge-embedding-worker
status: ACTIVE
verify_jwt: true
```

Guardrails:

- invocação exige o JWT exato de `service_role`;
- nenhum usuário autenticado comum pode disparar o consumo;
- nenhuma chave chega ao frontend;
- batch máximo de 128 documentos;
- limite diário máximo configurável;
- validação de exatamente 1.024 números finitos por embedding;
- erros do Voyage liberam jobs com retry;
- resposta registra `syntheticEmbedding=false`;
- conclusão persiste modelo, dimensão, hash, horário, request ID e tokens.

## Automação

Workflow:

```text
.github/workflows/knowledge-embedding-coverage.yml
```

Agenda padrão:

```text
10:15 UTC / 07:15 America/Sao_Paulo
```

Parâmetros padrão:

```text
batch_size: 32
iterations: 4
daily_limit: 128
```

O teto diário é aplicado no banco, não apenas no workflow. Execuções concorrentes não conseguem ultrapassar a cota contabilizada por jobs concluídos.

## Produto

A rota `/knowledge-search` exibe:

- cobertura semântica percentual;
- documentos cobertos e pendentes;
- jobs em processamento;
- conclusões reais do dia;
- baseline histórico;
- dead letters;
- modelo e dimensão;
- proibição de embedding sintético.

A telemetria é observacional e não altera score, qualification, patterns, ranking, pipeline ou decisão de crédito.

## Segurança

- tabela da fila sem acesso para `anon` ou `authenticated`;
- mutações disponíveis somente ao `service_role`;
- funções de trigger sem execução direta por usuários;
- agregação privilegiada isolada no schema `private`;
- wrapper público de cobertura como `security invoker`;
- policy explícita apenas para `service_role`;
- advisors sem alertas novos ligados à V10 após hardening;
- permanece apenas o alerta global conhecido de leaked-password protection desativado no Auth.

## Validação transacional

Smoke executado com rollback:

1. clonou um documento real sem embedding;
2. o trigger criou o job;
3. o worker transacional fez claim com lease;
4. a conclusão recebeu um embedding real correspondente de 1.024 dimensões;
5. o documento e o job foram atualizados;
6. request ID e tokens foram preservados;
7. a telemetria registrou uma conclusão do dia;
8. rollback removeu integralmente documento e job de teste.

Estado confirmado após rollback:

```text
Documentos: 2.541
Jobs: 2.541
Pendentes: 2.311
Processando: 0
Dead: 0
Resíduos smoke: 0
```

O primeiro smoke identificou que `pgvector` não possui operador de igualdade para `IS DISTINCT FROM`. A comparação foi corrigida pelo texto canônico do vetor antes da ativação do worker.

## Critérios de aceite

- [x] fila criada e populada no Supabase real;
- [x] leases e `SKIP LOCKED` implementados;
- [x] retries e dead letters implementados;
- [x] limite diário no banco;
- [x] baseline histórico separado do consumo diário;
- [x] invalidação de vetores obsoletos;
- [x] smoke transacional completo com rollback;
- [x] Edge Function ativa com JWT obrigatório;
- [x] workflow diário bounded;
- [x] telemetria autenticada no frontend;
- [x] advisors de segurança limpos para a V10;
- [ ] smoke persistente de um documento com Voyage real;
- [ ] CI da PR funcional;
- [ ] merge na `main`;
- [ ] rollout do frontend após liberação da capacidade de build Vercel.

## Próxima evolução

Após elevar a cobertura, a próxima fatia deve conectar a recuperação semântica aos contextos de decisão:

- Company Detail;
- briefing pré-reunião;
- memo de crédito;
- comparáveis de estruturas;
- Copilot com subgrafo controlado;
- explicação de patterns com evidências recuperadas.
