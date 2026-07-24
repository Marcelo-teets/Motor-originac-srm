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
Local do VOYAGE_API_KEY: Vercel only
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

## Worker serverless no Vercel

Arquivo:

```text
api/knowledge-embedding-worker.ts
```

O handler:

- roda no runtime server-side do Vercel;
- exige `Authorization: Bearer <CRON_SECRET>`;
- usa `VOYAGE_API_KEY` somente no Vercel;
- usa `SUPABASE_SERVICE_ROLE_KEY` somente no servidor;
- faz claim da fila antes do lote;
- chama Voyage com `voyage-3.5`, `input_type=document` e 1.024 dimensões;
- valida exatamente 1.024 números finitos por embedding;
- respeita `Retry-After` e agenda retry;
- conclui ou libera cada job individualmente;
- persiste modelo, dimensão, hash, horário, request ID e tokens;
- registra `syntheticEmbedding=false` em todas as respostas;
- devolve o SHA exato do deployment para smoke operacional.

### Edge Function desativada

A primeira versão experimental tentou executar o Voyage no Supabase e o smoke confirmou que `VOYAGE_API_KEY` não estava configurada naquele ambiente.

Como a política anterior do projeto exige a chave somente no Vercel, a função Supabase `knowledge-embedding-worker` foi redeployada em versão segura que responde `410 worker_moved_to_vercel` e não faz claim da fila.

Assim:

- nenhuma chave foi duplicada;
- nenhum job ficou preso;
- nenhuma cota foi consumida;
- o caminho oficial ficou único: GitHub Actions → Vercel → Voyage + Supabase.

## Remoção de mock legado

O backend possuía um `VectorIndexService` que fabricava vetores determinísticos de 1.536 dimensões.

A V10 remove esse comportamento:

- novos documentos são persistidos com `embedding = null`;
- metadata registra `synthetic_embedding=false`;
- o trigger cria um job real;
- buscas internas sem embedding de consulta usam o índice lexical oficial;
- nenhum vetor de 1.536 dimensões é criado ou consultado pelo serviço.

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

Fluxo:

```text
GitHub Actions
→ CRON_SECRET
→ endpoint Vercel
→ VOYAGE_API_KEY no Vercel
→ claim / complete / retry no Supabase
```

O teto diário é aplicado no banco, não apenas no workflow. Execuções concorrentes não conseguem ultrapassar a cota contabilizada por jobs concluídos.

Smoke manual:

```text
.github/workflows/knowledge-embedding-worker-smoke.yml
```

O smoke fica em `workflow_dispatch` e só deve ser executado após o deployment conter o SHA da V10.

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
- `VOYAGE_API_KEY` permanece somente no Vercel;
- execução do worker exige `CRON_SECRET` com comparação constante;
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

## Validação de engenharia

- migration aplicada no Supabase real;
- Edge Function experimental desativada sem claim;
- CI normal passou após a troca de arquitetura;
- `api/knowledge-embedding-worker.ts` ganhou typecheck dedicado via `tsconfig.serverless.json`;
- preview e deployment Vercel permanecem bloqueados pela capacidade `build-rate-limit` da conta;
- o smoke Voyage persistente aguarda o endpoint Vercel conter esta versão.

## Critérios de aceite

- [x] fila criada e populada no Supabase real;
- [x] leases e `SKIP LOCKED` implementados;
- [x] retries e dead letters implementados;
- [x] limite diário no banco;
- [x] baseline histórico separado do consumo diário;
- [x] invalidação de vetores obsoletos;
- [x] smoke transacional completo com rollback;
- [x] worker implementado no Vercel com secret Vercel-only;
- [x] Edge Function antiga desativada com segurança;
- [x] workflow diário bounded;
- [x] telemetria autenticada no frontend;
- [x] mock legado de 1.536 dimensões removido;
- [x] advisors de segurança limpos para a V10;
- [ ] smoke persistente de um documento com Voyage real após deployment;
- [ ] merge na `main`;
- [ ] rollout do frontend e endpoint após liberação da capacidade de build Vercel.

## Próxima evolução

Após elevar a cobertura, a próxima fatia deve conectar a recuperação semântica aos contextos de decisão:

- Company Detail;
- briefing pré-reunião;
- memo de crédito;
- comparáveis de estruturas;
- Copilot com subgrafo controlado;
- explicação de patterns com evidências recuperadas.
