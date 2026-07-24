# Knowledge Vault — Outcome Operations V7

## Objetivo

Transformar a instrumentação da V6 em rotina operacional, sem criar outcome sintético e sem abrir um CRM paralelo.

Fluxo:

```text
atividade/tarefa/pipeline real
→ fila Outcome Operations
→ instrumentação humana opcional do histórico
→ nota histórica reconstruída + lineage + tarefa
→ registro de resultado no Company Detail
→ Outcome Intelligence observacional
```

## Problema atacado

Na implantação da V7, o Supabase possuía:

- 13 atividades reais;
- 15 tarefas abertas;
- 8 empresas no pipeline;
- nenhuma atividade originada ou instrumentada pelo Knowledge Vault;
- nenhuma amostra de outcome operacional.

A ausência de uma fila consolidada impedia que atividades e tarefas existentes fossem convertidas em aprendizado auditável.

## Banco de dados

Migration:

```text
db/migrations/093_knowledge_outcome_operations.sql
```

### `knowledge_outcome_operations`

RPC autenticada que retorna:

- ações instrumentadas aguardando resultado;
- tarefas vencidas;
- tarefas dos próximos sete dias;
- pipelines ativos sem próxima ação ou com prazo vencido;
- atividades históricas elegíveis para instrumentação explícita.

A função respeita RLS e aceita filtro opcional por empresa.

### `knowledge_adopt_existing_activity`

Instrumenta uma atividade histórica somente após ação explícita do usuário.

Quando nenhuma nota é fornecida, a transação cria:

1. nota histórica vinculada à empresa;
2. marcação `reconstructed_at_adoption`;
3. `knowledge_reference` para activity;
4. `knowledge_reference` para pipeline;
5. tarefa real para confirmação do resultado;
6. `knowledge_reference` para a nova tarefa;
7. contexto de qualification, lead score, pipeline, padrões e fatores existente no momento da adoção.

A nota inclui caveat explícito de que o contexto foi reconstruído e não capturado na data original.

### Idempotência

A adoção usa advisory lock por `activity_id`.

- primeira chamada: cria nota, referências e tarefa;
- chamadas repetidas: retornam `already_instrumented`;
- nenhuma duplicidade é criada.

### View V6 ampliada

`knowledge_execution_outcomes_v1` passa a aceitar:

- ações criadas diretamente pelo Vault;
- atividades históricas com `outcomeInstrumentationOrigin = knowledge_vault_v7`.

O `contextMode` distingue:

- `captured_at_action`;
- `reconstructed_at_adoption`;
- demais reconstruções legadas.

## Frontend

Nova rota:

```text
/outcome-operations
```

Nova opção no menu **Execução comercial**.

A página reúne:

- Outcome Operations V7;
- Outcome Intelligence V6;
- ações aguardando resultado;
- tarefas vencidas e próximas;
- pipeline sem ação vigente;
- histórico elegível para instrumentação.

### Instrumentação do histórico

O botão **Instrumentar atividade**:

1. exige confirmação humana;
2. chama a RPC idempotente;
3. cria nota histórica e tarefa no Supabase;
4. atualiza a fila;
5. atualiza o painel de Outcome Intelligence;
6. não registra resultado automaticamente.

O resultado continua sendo informado no Company Detail pelo fluxo V5.

## Smoke autenticado

O teste foi executado dentro de transação e revertido.

Atividade usada:

```text
Call com CFO Neon — discussão preliminar FIDC
```

Resultados:

- fila antes: 0 outcomes pendentes e 13 candidatas;
- primeira adoção: `instrumented`;
- segunda adoção: `already_instrumented`;
- exatamente 1 nota criada;
- exatamente 1 tarefa criada;
- exatamente 1 referência de activity criada;
- `contextMode = reconstructed_at_adoption`;
- fila após adoção: 1 outcome pendente e 12 candidatas;
- rollback confirmou zero resíduos.

## Guardrails

- nenhuma atividade é adotada automaticamente;
- nenhuma decisão é inferida como won/lost;
- nenhuma adoção altera score, qualification, patterns ou ranking;
- atividade concluída não pode ser adotada como pendente;
- empresa precisa estar no pipeline oficial;
- contexto histórico nunca é apresentado como snapshot original;
- toda execução reutiliza `activities`, `tasks`, `pipeline` e `knowledge_references` oficiais.

## Próxima disciplina operacional

O time deve usar a fila diariamente para:

1. instrumentar somente atividades relevantes;
2. registrar fatos e resultados no Company Detail;
3. manter próxima ação e prazo do pipeline atualizados;
4. acumular amostra real antes de interpretar taxas de conversão;
5. preservar governança humana sobre qualquer ajuste futuro de pesos.
